// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useEffect, useMemo, useRef, useState } from '@lynx-js/react'

import type { LayoutChangeEvent } from '@lynx-js/types'
import { clsx } from 'clsx'

import { SheetPositionerContext } from '../context'
import type { SheetPositionerDimensions } from '../context'
import type { SheetPositionerProps } from '../types'

const PX_OFFSET_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/

function parseStyleOffsetPx(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  if (typeof value === 'string') {
    const match = PX_OFFSET_PATTERN.exec(value)
    if (match) {
      const parsed = Number(match[1])
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
  }
  return 0
}

/** Establish local layout and calculation bounds, synchronously or via auto-measurement. */
export function SheetPositioner(props: SheetPositionerProps) {
  const {
    width,
    height,
    onSizeChange,
    children,
    className,
    style,
    positionerProps,
  } = props
  if (width !== undefined && (!Number.isFinite(width) || width <= 0)) {
    throw new Error('SheetPositioner width must be a positive pixel number')
  }
  if (height !== undefined && (!Number.isFinite(height) || height <= 0)) {
    throw new Error('SheetPositioner height must be a positive pixel number')
  }
  const insetX = width === undefined
    ? parseStyleOffsetPx(style?.left) + parseStyleOffsetPx(style?.right)
    : 0
  const insetY = height === undefined
    ? parseStyleOffsetPx(style?.top) + parseStyleOffsetPx(style?.bottom)
    : 0

  const [measured, setMeasured] = useState<
    { width: number, height: number } | null
  >(null)
  const resolvedWidth = width ?? measured?.width
  const resolvedHeight = height ?? measured?.height
  const dimensions = useMemo<SheetPositionerDimensions | null>(
    () => {
      if (resolvedWidth !== undefined && resolvedHeight !== undefined) {
        return { width: resolvedWidth, height: resolvedHeight }
      }
      if (insetX > 0 || insetY > 0) {
        return { insetX, insetY }
      }
      return null
    },
    [resolvedWidth, resolvedHeight, insetX, insetY],
  )
  const onSizeChangeRef = useRef(onSizeChange)
  onSizeChangeRef.current = onSizeChange
  const lastNotifiedRef = useRef<{ width: number, height: number } | null>(null)
  const needsMeasure = width === undefined || height === undefined

  useEffect(() => {
    if (
      dimensions?.width === undefined
      || dimensions.height === undefined
    ) return
    const previous = lastNotifiedRef.current
    if (
      previous?.width === dimensions.width
      && previous.height === dimensions.height
    ) return
    const nextSize = { width: dimensions.width, height: dimensions.height }
    lastNotifiedRef.current = nextSize
    onSizeChangeRef.current?.(nextSize)
  }, [dimensions])

  function handleLayoutChange(event: LayoutChangeEvent) {
    const { width: nextWidth, height: nextHeight } = event.detail
    if (nextWidth > 0 && nextHeight > 0) {
      setMeasured(previous =>
        previous?.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      )
    }
    positionerProps?.bindlayoutchange?.(event)
  }

  return (
    <SheetPositionerContext.Provider value={dimensions}>
      <view
        {...positionerProps}
        className={clsx('lynx-ui-sheet__positioner', className)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          ...(width === undefined ? { right: 0 } : {}),
          ...(height === undefined ? { bottom: 0 } : {}),
          ...style,
          ...(width === undefined ? {} : { width: `${width}px` }),
          ...(height === undefined ? {} : { height: `${height}px` }),
          overflow: 'hidden',
        }}
        event-through={true}
        bindlayoutchange={needsMeasure
          ? handleLayoutChange
          : positionerProps?.bindlayoutchange}
      >
        {children}
      </view>
    </SheetPositionerContext.Provider>
  )
}
