import type { RecycleScrollerMeasurementState, ScrollDirection, ScrollState } from '../../types/recycle-scroller'

function resolveElementMainAxisSize(
  element: HTMLElement | undefined,
  direction: ScrollDirection,
  sizeType: 'client' | 'offset',
): number {
  if (!element) {
    return 0
  }

  if (direction === 'vertical') {
    return sizeType === 'client' ? element.clientHeight : element.offsetHeight
  }

  return sizeType === 'client' ? element.clientWidth : element.offsetWidth
}

export function readRecycleScrollerScrollState(
  element: HTMLElement | undefined,
  direction: ScrollDirection,
): ScrollState {
  if (!element) {
    return { start: 0, end: 0 }
  }

  if (direction === 'vertical') {
    return {
      start: element.scrollTop,
      end: element.scrollTop + element.clientHeight,
    }
  }

  return {
    start: element.scrollLeft,
    end: element.scrollLeft + element.clientWidth,
  }
}

export function readRecycleScrollerMeasurement(
  container: HTMLElement | undefined,
  before: HTMLElement | undefined,
  direction: ScrollDirection,
): RecycleScrollerMeasurementState {
  return {
    beforeSize: resolveElementMainAxisSize(before, direction, 'offset'),
    viewportSize: resolveElementMainAxisSize(container, direction, 'client'),
    scroll: readRecycleScrollerScrollState(container, direction),
  }
}

export function observeRecycleScrollerMeasurements(
  container: HTMLElement | undefined,
  before: HTMLElement | undefined,
  onResize: () => void,
): () => void {
  const disposers: Array<() => void> = []

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      onResize()
    })

    if (container) {
      observer.observe(container)
    }

    if (before) {
      observer.observe(before)
    }

    disposers.push(() => {
      observer.disconnect()
    })
  }

  if (typeof window !== 'undefined') {
    const handleResize = () => {
      onResize()
    }

    window.addEventListener('resize', handleResize)
    disposers.push(() => {
      window.removeEventListener('resize', handleResize)
    })
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}

export function scrollRecycleScrollerToPosition(
  element: HTMLElement | undefined,
  direction: ScrollDirection,
  position: number,
): void {
  if (!element) {
    return
  }

  const safePosition = Math.max(0, position)

  if (direction === 'vertical') {
    element.scrollTop = safePosition
  }
  else {
    element.scrollLeft = safePosition
  }
}
