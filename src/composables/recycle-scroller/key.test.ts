import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecycleScrollerItemKeyValue } from '../../types/recycle-scroller'

import {
  resolveRecycleScrollerItemKeys,
  warnDuplicateRecycleScrollerItemKeys,
} from './key'

describe('resolveRecycleScrollerItemKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps unique keys unchanged', () => {
    const resolved = resolveRecycleScrollerItemKeys([
      { id: 'row-0' },
      { id: 'row-1' },
      { id: 'row-2' },
    ], 'id')

    expect(resolved.effectiveKeys).toEqual(['row-0', 'row-1', 'row-2'])
    expect(Array.from(resolved.duplicateCounts.entries())).toEqual([])
  })

  it('synthesizes stable keys for duplicates while avoiding original key collisions', () => {
    const resolved = resolveRecycleScrollerItemKeys([
      { id: 'same' },
      { id: 'same' },
      { id: 'same_1' },
      { id: 'same' },
      { id: 12 },
      { id: 12 },
      { id: '12_1' },
    ], 'id')

    expect(resolved.effectiveKeys).toEqual([
      'same',
      'same_2',
      'same_1',
      'same_3',
      12,
      '12_2',
      '12_1',
    ])
    expect(Array.from(resolved.duplicateCounts.entries())).toEqual([
      ['same', 3],
      [12, 2],
    ])
  })

  it('warns in development mode when duplicate keys are detected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const duplicateCounts = new Map<RecycleScrollerItemKeyValue, number>([
      ['same', 2],
      [12, 3],
    ])

    warnDuplicateRecycleScrollerItemKeys('DynamicScroller', duplicateCounts)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('DynamicScroller detected duplicate itemKey values')
    expect(warnSpy.mock.calls[0]?.[0]).toContain('"same" x2')
    expect(warnSpy.mock.calls[0]?.[0]).toContain('"12" x3')
  })
})
