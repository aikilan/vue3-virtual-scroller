import type { FixedHeightRange, FixedHeightRangeInput, ScrollDirection } from '../../types/recycle-scroller'

import { DEFAULT_RECYCLE_SCROLLER_ITEMS_LIMIT } from './constants'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function assertValidItemSize(itemSize: number): void {
  if (!Number.isFinite(itemSize) || itemSize <= 0) {
    throw new Error('RecycleScroller requires a positive itemSize in fixed-height mode.')
  }
}

export function resolveFixedHeightRange(input: FixedHeightRangeInput): FixedHeightRange {
  const { count, itemSize, buffer, scrollStart, scrollEnd, beforeSize = 0 } = input

  assertValidItemSize(itemSize)

  const contentStart = Math.max(0, scrollStart - beforeSize)
  const contentEnd = Math.max(0, scrollEnd - beforeSize)

  return {
    startIndex: clamp(Math.floor(Math.max(0, contentStart - buffer) / itemSize), 0, count),
    endIndex: clamp(Math.ceil((contentEnd + buffer) / itemSize), 0, count),
    visibleStartIndex: clamp(Math.floor(contentStart / itemSize), 0, count),
    visibleEndIndex: clamp(Math.ceil(contentEnd / itemSize), 0, count),
    totalSize: count * itemSize,
  }
}

export function resolveWrapperStyle(direction: ScrollDirection, totalSize: number): Record<string, string> {
  return direction === 'vertical'
    ? { height: `${totalSize}px` }
    : { width: `${totalSize}px` }
}

export function resolveItemStyle(
  direction: ScrollDirection,
  position: number,
  itemSize: number,
): Record<string, string> {
  return direction === 'vertical'
    ? { transform: `translateY(${position}px)`, height: `${itemSize}px`, width: '100%' }
    : { transform: `translateX(${position}px)`, width: `${itemSize}px`, height: '100%' }
}

export function resolveViewportItemCapacity(viewportSize: number, itemSize: number): number {
  assertValidItemSize(itemSize)

  if (viewportSize <= 0) {
    return 1
  }

  return Math.max(1, Math.ceil(viewportSize / itemSize))
}

export function assertRenderWindowWithinLimit(
  renderCount: number,
  limit = DEFAULT_RECYCLE_SCROLLER_ITEMS_LIMIT,
): void {
  if (renderCount > limit) {
    throw new Error(
      `RecycleScroller tried to render ${renderCount} items in a single window. Ensure the container has a fixed size and scrollable overflow.`,
    )
  }
}
