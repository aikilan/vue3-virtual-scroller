import { describe, expect, it } from 'vitest'

import {
  assertValidMinItemSize,
  createDynamicSizeLayoutCache,
  resolveAnchorScrollDelta,
  resolveDynamicSizeLayout,
  resolveDynamicSizeRange,
  resolveDynamicSizeRangeFromCache,
  snapshotDynamicSizeLayoutCache,
  syncDynamicSizeLayoutCache,
  updateDynamicSizeMeasurement,
} from './range'

describe('dynamic-scroller range helpers', () => {
  it('builds estimated offsets from minItemSize and measured sizes', () => {
    const sizeMap = new Map<string, number>([['row-1', 90]])

    expect(
      resolveDynamicSizeLayout({
        items: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }],
        itemKey: 'id',
        minItemSize: 60,
        sizeMap,
      }),
    ).toEqual({
      keys: ['row-0', 'row-1', 'row-2'],
      offsets: [0, 60, 150, 210],
      totalSize: 210,
    })
  })

  it('resolves the dynamic visible range with buffer', () => {
    expect(
      resolveDynamicSizeRange({
        offsets: [0, 60, 120, 210, 270],
        count: 4,
        buffer: 30,
        scrollStart: 70,
        scrollEnd: 170,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      visibleStartIndex: 1,
      visibleEndIndex: 3,
      totalSize: 270,
    })
  })

  it('only applies anchor compensation for rows above the viewport', () => {
    expect(resolveAnchorScrollDelta(0, 3, 60, 90)).toBe(30)
    expect(resolveAnchorScrollDelta(3, 3, 60, 90)).toBe(0)
  })

  it('reuses measured sizes by key and prunes removed measurements during cache sync', () => {
    const sizeMap = new Map<string, number>([
      ['row-0', 80],
      ['row-1', 90],
      ['row-stale', 120],
    ])
    const cache = createDynamicSizeLayoutCache()

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-0' }, { id: 'row-1' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    expect(snapshotDynamicSizeLayoutCache(cache)).toEqual({
      keys: ['row-0', 'row-1'],
      offsets: [0, 80, 170],
      totalSize: 170,
    })

    expect(Array.from(sizeMap.entries())).toEqual([
      ['row-0', 80],
      ['row-1', 90],
    ])
  })

  it('reuses measured sizes by key after in-place logical reordering', () => {
    const sizeMap = new Map<string, number>([
      ['row-0', 80],
      ['row-1', 90],
    ])
    const cache = createDynamicSizeLayoutCache()

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-2' }, { id: 'row-0' }, { id: 'row-1' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    expect(snapshotDynamicSizeLayoutCache(cache)).toEqual({
      keys: ['row-2', 'row-0', 'row-1'],
      offsets: [0, 60, 140, 230],
      totalSize: 230,
    })
  })

  it('applies repeated measurement updates through the cache without rebuilding an offsets suffix', () => {
    const sizeMap = new Map<string, number>([['row-1', 90]])
    const cache = createDynamicSizeLayoutCache()

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    expect(updateDynamicSizeMeasurement(cache, sizeMap, 'row-1', 1, 120, 60)).toEqual({
      changed: true,
      currentIndex: 1,
      previousSize: 90,
      requiresLayoutSync: false,
    })

    expect(updateDynamicSizeMeasurement(cache, sizeMap, 'row-0', 0, 75, 60)).toEqual({
      changed: true,
      currentIndex: 0,
      previousSize: 60,
      requiresLayoutSync: false,
    })

    expect(snapshotDynamicSizeLayoutCache(cache)).toEqual({
      keys: ['row-0', 'row-1', 'row-2'],
      offsets: [0, 75, 195, 255],
      totalSize: 255,
    })
  })

  it('stores unknown-key measurements until the layout cache is resynced', () => {
    const sizeMap = new Map<string, number>([['row-0', 50]])
    const cache = createDynamicSizeLayoutCache()

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-0' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    expect(updateDynamicSizeMeasurement(cache, sizeMap, 'row-1', 0, 80, 60)).toEqual({
      changed: true,
      currentIndex: 0,
      previousSize: 60,
      requiresLayoutSync: true,
    })

    expect(sizeMap.get('row-1')).toBe(80)
    expect(snapshotDynamicSizeLayoutCache(cache)).toEqual({
      keys: ['row-0'],
      offsets: [0, 50],
      totalSize: 50,
    })

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-1' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    expect(snapshotDynamicSizeLayoutCache(cache)).toEqual({
      keys: ['row-1'],
      offsets: [0, 80],
      totalSize: 80,
    })
  })

  it('matches offset-array range semantics when resolving ranges from the Fenwick cache', () => {
    const sizeMap = new Map<string, number>([['row-2', 90]])
    const cache = createDynamicSizeLayoutCache()

    syncDynamicSizeLayoutCache(cache, {
      items: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }],
      itemKey: 'id',
      minItemSize: 60,
      sizeMap,
    })

    const expected = resolveDynamicSizeRange({
      offsets: [0, 60, 120, 210, 270],
      count: 4,
      buffer: 30,
      scrollStart: 120,
      scrollEnd: 210,
    })

    expect(resolveDynamicSizeRangeFromCache({
      cache,
      buffer: 30,
      scrollStart: 120,
      scrollEnd: 210,
    })).toEqual(expected)
  })

  it('rejects invalid minItemSize values', () => {
    expect(() => assertValidMinItemSize(0)).toThrow('DynamicScroller requires a positive minItemSize')
  })
})
