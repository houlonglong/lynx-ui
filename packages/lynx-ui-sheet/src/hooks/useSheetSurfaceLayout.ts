// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { runOnMainThread, useEffect, useMainThreadRef } from '@lynx-js/react'
import type { MainThreadRef } from '@lynx-js/react'

import { PresenceState } from '@lynx-js/lynx-ui-presence'
import { useMotionValueRef, useMotionValueRefEvent } from '@lynx-js/motion/mini'
import type { MotionValue } from '@lynx-js/motion/mini'
import type { MainThread } from '@lynx-js/types'

import type { SheetContentProps, SheetTransition } from '../types'
import { useSheetAnimation } from './useSheetAnimation'

interface SheetSurfaceLayoutOptions {
  animateChanges: MainThreadRef<boolean>
  position: MainThreadRef<MotionValue<number>>
  presence: MainThreadRef<PresenceState>
  resolvedSide: 'top' | 'bottom' | 'left' | 'right'
  panelLayout?: SheetContentProps['panelLayout']
  screenHeight: number
  maxSnapSize: number
  hasFitSnapPoint: boolean
  movingSurfaceMTRef?: MainThreadRef<MainThread.Element | null>
  initialSize: (index: number) => number
  initialSnap: number
  snapAnimation: SheetTransition
}

// Separate background coverage from movement and intrinsic content measurement.
export function useSheetSurfaceLayout({
  position,
  animateChanges,
  presence,
  resolvedSide,
  panelLayout,
  screenHeight,
  maxSnapSize,
  hasFitSnapPoint,
  movingSurfaceMTRef,
  initialSize,
  initialSnap,
  snapAnimation,
}: SheetSurfaceLayoutOptions) {
  const isBottom = resolvedSide === 'bottom'
  const requestedGap = panelLayout?.bottomGap ?? 0
  const inset = isBottom && Number.isFinite(requestedGap)
    ? Math.max(0, requestedGap)
    : 0
  const coverage = isBottom && panelLayout ? 0 : 1
  const clipMTRef = useMainThreadRef<MainThread.Element | null>(null)
  const surfaceMTRef = useMainThreadRef<MainThread.Element | null>(null)
  const viewportMTRef = useMainThreadRef<MainThread.Element | null>(null)
  const panelHeightMTRef = useMainThreadRef(0)
  const appearanceMTRef = useMainThreadRef({
    inset,
    coverage,
    fromInset: inset,
    fromCoverage: coverage,
    toInset: inset,
    toCoverage: coverage,
  })
  const surfaceStylesMTRef = useMainThreadRef({
    clipTransform: 'translateY(0px)',
    translation: '',
    surfaceHeight: `${screenHeight * 1.5}px`,
    viewportHeight: `${maxSnapSize}px`,
  })
  const progress = useMotionValueRef(1)
  const animation = useSheetAnimation(progress, snapAnimation)
  const animateAppearanceMT = animation.animateToMT
  const stopAppearanceMT = animation.stopAnimationMT

  function updateSurfaceMT() {
    'main thread'
    if (resolvedSide === 'left' || resolvedSide === 'right') return
    const motion = position.current
    if (!motion) return
    const value = Math.max(0, motion.get())
    const state = presence.current
    const entering = state === PresenceState.Entering
    const leaving = state === PresenceState.Leaving
      || state === PresenceState.Left
    const height = entering
      ? Math.max(value, initialSize(initialSnap), 0)
      : (leaving ? Math.max(panelHeightMTRef.current, value) : value)
    panelHeightMTRef.current = height
    const appearance = appearanceMTRef.current
    // Entry and exit translate a complete card beyond the screen edge.
    const visibleFraction = entering || leaving
      ? (height > 0 ? Math.min(1, value / height) : 0)
      : 1
    const effectiveInset = isBottom ? appearance.inset * visibleFraction : 0
    // Keep a bounded panel's top inside the viewport without losing its gap.
    const overflow = Math.max(0, value + effectiveInset - screenHeight)
    const correction = isBottom
      ? Math.min(height, overflow) * (1 - appearance.coverage)
      : 0
    const visibleHeight = height - correction

    // Clip the bottom gap via compositor transform instead of mutating layout bottom.
    const visualTop = screenHeight - value - effectiveInset + correction
    const clipOffset = isBottom && effectiveInset > 0
      ? Math.max(0, screenHeight - (visualTop + visibleHeight))
      : 0
    const applied = surfaceStylesMTRef.current
    const clipTransform = `translateY(${-clipOffset}px)`
    const clip = clipMTRef.current
    if (clip && applied.clipTransform !== clipTransform) {
      applied.clipTransform = clipTransform
      clip.setStyleProperties({ transform: clipTransform })
    }

    const translateY = resolvedSide === 'top'
      ? motion.get()
      : -motion.get() - (effectiveInset - clipOffset) + correction
    const translation = `translate(0px, ${translateY}px)`
    const movingSurface = movingSurfaceMTRef?.current
    if (movingSurface && applied.translation !== translation) {
      applied.translation = translation
      movingSurface.setStyleProperties({ transform: translation })
    }

    const surface = surfaceMTRef.current
    const nextSurfaceHeight = `${
      Math.max(visibleHeight, screenHeight * 1.5 * appearance.coverage)
    }px`
    if (surface && applied.surfaceHeight !== nextSurfaceHeight) {
      applied.surfaceHeight = nextSurfaceHeight
      surface.setStyleProperties({ height: nextSurfaceHeight })
    }

    if (!hasFitSnapPoint) {
      const contentHeight = isBottom
        ? Math.min(maxSnapSize, Math.max(0, screenHeight - appearance.toInset))
        : maxSnapSize
      const nextViewportHeight = `${contentHeight}px`
      const viewport = viewportMTRef.current
      if (viewport && applied.viewportHeight !== nextViewportHeight) {
        applied.viewportHeight = nextViewportHeight
        viewport.setStyleProperties({ height: nextViewportHeight })
      }
    }
  }

  useMotionValueRefEvent(position, 'change', updateSurfaceMT)
  useMotionValueRefEvent(progress, 'change', value => {
    'main thread'
    const appearance = appearanceMTRef.current
    const p = Math.max(0, Math.min(1, value))
    appearance.inset = appearance.fromInset
      + (appearance.toInset - appearance.fromInset) * p
    appearance.coverage = appearance.fromCoverage
      + (appearance.toCoverage - appearance.fromCoverage) * p
    updateSurfaceMT()
  })

  function configureSurfaceMT(nextInset: number, nextCoverage: number) {
    'main thread'
    const appearance = appearanceMTRef.current
    if (
      appearance.toInset === nextInset && appearance.toCoverage === nextCoverage
    ) {
      updateSurfaceMT()
      return
    }
    stopAppearanceMT()
    appearance.fromInset = appearance.inset
    appearance.fromCoverage = appearance.coverage
    appearance.toInset = nextInset
    appearance.toCoverage = nextCoverage
    progress.current.jump(0)
    if (
      animateChanges.current
      && (presence.current === PresenceState.Entered
        || presence.current === PresenceState.Entering)
    ) {
      animateAppearanceMT(1)
    } else {
      progress.current.jump(1)
    }
  }

  useEffect(() => {
    runOnMainThread(configureSurfaceMT)(inset, coverage)
  }, [inset, coverage, screenHeight, maxSnapSize, hasFitSnapPoint])
  useEffect(() => () => {
    runOnMainThread(() => {
      'main thread'
      if (progress.current) stopAppearanceMT()
    })()
  }, [])

  function setSurfaceMTRef(element: MainThread.Element | null) {
    'main thread'
    if (surfaceMTRef.current !== element) {
      surfaceStylesMTRef.current.surfaceHeight = `${screenHeight * 1.5}px`
    }
    surfaceMTRef.current = element
    if (element) updateSurfaceMT()
  }

  function setViewportMTRef(element: MainThread.Element) {
    'main thread'
    if (viewportMTRef.current !== element) {
      surfaceStylesMTRef.current.viewportHeight = `${maxSnapSize}px`
    }
    viewportMTRef.current = element
    updateSurfaceMT()
  }

  function setSheetMTRef(element: MainThread.Element | null) {
    'main thread'
    if (!movingSurfaceMTRef) return
    movingSurfaceMTRef.current = element
    surfaceStylesMTRef.current.translation = ''
    if (element) updateSurfaceMT()
  }

  function setClipMTRef(element: MainThread.Element) {
    'main thread'
    if (clipMTRef.current !== element) {
      surfaceStylesMTRef.current.clipTransform = 'translateY(0px)'
    }
    clipMTRef.current = element
    updateSurfaceMT()
  }

  return { setSheetMTRef, setClipMTRef, setSurfaceMTRef, setViewportMTRef }
}
