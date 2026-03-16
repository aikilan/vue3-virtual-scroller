import { describe, expect, it } from 'vitest'

import type {
  DynamicScrollerProps,
  RecycleScrollerProps,
  ScrollBoundaryPayload,
  ScrollPositionPayload,
} from './recycle-scroller'

describe('recycle scroller public props types', () => {
  it('accepts scroll event listeners in exported prop interfaces', () => {
    const handleScrollBoundary = (_payload: ScrollBoundaryPayload) => undefined
    const handleScrollPosition = (_payload: ScrollPositionPayload) => undefined

    const recycleScrollerProps: RecycleScrollerProps = {
      items: [],
      itemSize: 1,
      onScrollTop: handleScrollBoundary,
      onScrollEnd: handleScrollBoundary,
      onScrollPosition: handleScrollPosition,
    }
    const dynamicScrollerProps: DynamicScrollerProps = {
      items: [],
      minItemSize: 1,
      onScrollTop: handleScrollBoundary,
      onScrollEnd: handleScrollBoundary,
      onScrollPosition: handleScrollPosition,
    }

    expect(recycleScrollerProps.onScrollTop).toBe(handleScrollBoundary)
    expect(recycleScrollerProps.onScrollEnd).toBe(handleScrollBoundary)
    expect(recycleScrollerProps.onScrollPosition).toBe(handleScrollPosition)
    expect(dynamicScrollerProps.onScrollTop).toBe(handleScrollBoundary)
    expect(dynamicScrollerProps.onScrollEnd).toBe(handleScrollBoundary)
    expect(dynamicScrollerProps.onScrollPosition).toBe(handleScrollPosition)
  })
})
