import { describe, expect, it } from 'vitest'

import {
  assertValidItemSize,
  resolveFixedHeightRange,
  resolveItemStyle,
  resolveRecycleScrollerItemKey,
  resolveWrapperStyle,
} from './useRecycleScroller'

describe('useRecycleScroller helpers', () => {
  it('computes the initial fixed-height render range with buffer', () => {
    expect(
      resolveFixedHeightRange({
        count: 100,
        itemSize: 30,
        buffer: 30,
        scrollStart: 0,
        scrollEnd: 90,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 4,
      visibleStartIndex: 0,
      visibleEndIndex: 3,
      totalSize: 3000,
    })
  })

  it('includes before slot size when calculating the visible range', () => {
    expect(
      resolveFixedHeightRange({
        count: 20,
        itemSize: 30,
        buffer: 0,
        scrollStart: 0,
        scrollEnd: 90,
        beforeSize: 60,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 1,
      visibleStartIndex: 0,
      visibleEndIndex: 1,
      totalSize: 600,
    })
  })

  it('updates the render range after scrolling', () => {
    expect(
      resolveFixedHeightRange({
        count: 100,
        itemSize: 30,
        buffer: 60,
        scrollStart: 90,
        scrollEnd: 180,
      }),
    ).toEqual({
      startIndex: 1,
      endIndex: 8,
      visibleStartIndex: 3,
      visibleEndIndex: 6,
      totalSize: 3000,
    })
  })

  it('returns direction-specific wrapper and item styles', () => {
    expect(resolveWrapperStyle('vertical', 240)).toEqual({ height: '240px' })
    expect(resolveWrapperStyle('horizontal', 240)).toEqual({ width: '240px' })

    expect(resolveItemStyle('vertical', 60, 30)).toEqual({
      transform: 'translateY(60px)',
      height: '30px',
      width: '100%',
    })

    expect(resolveItemStyle('horizontal', 80, 40)).toEqual({
      transform: 'translateX(80px)',
      width: '40px',
      height: '100%',
    })
  })

  it('resolves stable object keys and primitive function keys', () => {
    expect(resolveRecycleScrollerItemKey({ id: 'row-1' }, 0, 'id')).toBe('row-1')
    expect(resolveRecycleScrollerItemKey('plain-item', 4, (item) => item as string)).toBe('plain-item')
  })

  it('rejects invalid itemKey usage', () => {
    expect(() => resolveRecycleScrollerItemKey({ name: 'missing' }, 0, 'id')).toThrow(
      'RecycleScroller could not resolve a stable key',
    )

    expect(() => resolveRecycleScrollerItemKey('plain-item', 0, 'id')).toThrow(
      'RecycleScroller requires itemKey as a function when list items are not objects.',
    )
  })

  it('rejects invalid fixed item sizes', () => {
    expect(() => assertValidItemSize(0)).toThrow('RecycleScroller requires a positive itemSize')
  })
})
