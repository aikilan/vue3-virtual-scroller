import { describe, expect, it } from 'vitest'

import type {
  DynamicScrollerProps,
  RecycleScrollerProps,
  ScrollPositionPayload,
} from './recycle-scroller'

describe('recycle scroller public props types', () => {
  it('accepts onScrollPosition listeners in exported prop interfaces', () => {
    const handleScrollPosition = (_payload: ScrollPositionPayload) => undefined

    const recycleScrollerProps: RecycleScrollerProps = {
      items: [],
      itemSize: 1,
      onScrollPosition: handleScrollPosition,
    }
    const dynamicScrollerProps: DynamicScrollerProps = {
      items: [],
      minItemSize: 1,
      onScrollPosition: handleScrollPosition,
    }

    expect(recycleScrollerProps.onScrollPosition).toBe(handleScrollPosition)
    expect(dynamicScrollerProps.onScrollPosition).toBe(handleScrollPosition)
  })
})
