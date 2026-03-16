import type {
  DynamicSizeRange,
  RecycleScrollerItemKey,
  RecycleScrollerItemKeyValue,
} from '../../types/recycle-scroller'

import { resolveRecycleScrollerItemKey } from '../recycle-scroller/key'
import { clamp } from '../recycle-scroller/range'

export interface DynamicSizeLayout {
  keys: RecycleScrollerItemKeyValue[]
  offsets: number[]
  totalSize: number
}

interface FenwickTree {
  size: number
  tree: number[]
}

export interface DynamicSizeLayoutCache {
  firstMeasurementChangeIndex: number | null
  fenwickTree: FenwickTree
  indexByKey: Map<RecycleScrollerItemKeyValue, number>
  keys: RecycleScrollerItemKeyValue[]
  minItemSize: number
  sizes: number[]
  totalSize: number
}

export interface ResolveDynamicSizeLayoutInput {
  items: unknown[]
  itemKey: RecycleScrollerItemKey
  minItemSize: number
  sizeMap: Map<RecycleScrollerItemKeyValue, number>
}

export interface DynamicSizeRangeInput {
  offsets: number[]
  count: number
  buffer: number
  scrollStart: number
  scrollEnd: number
  beforeSize?: number
}

export interface DynamicSizeMeasurementResult {
  changed: boolean
  currentIndex: number | null
  previousSize: number
  requiresLayoutSync: boolean
}

export function assertValidMinItemSize(minItemSize: number): void {
  if (!Number.isFinite(minItemSize) || minItemSize <= 0) {
    throw new Error('DynamicScroller requires a positive minItemSize.')
  }
}

function lowerBound(offsets: number[], target: number): number {
  let low = 0
  let high = offsets.length - 1

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle] < target) {
      low = middle + 1
    }
    else {
      high = middle
    }
  }

  return low
}

function upperBound(offsets: number[], target: number): number {
  let low = 0
  let high = offsets.length - 1

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle] <= target) {
      low = middle + 1
    }
    else {
      high = middle
    }
  }

  return low
}

function resolveHighestOneBit(value: number): number {
  let bit = 1

  while ((bit << 1) <= value) {
    bit <<= 1
  }

  return bit
}

function createFenwickTree(size = 0): FenwickTree {
  return {
    size,
    tree: new Array(size + 1).fill(0),
  }
}

function buildFenwickTree(tree: FenwickTree, values: number[]): void {
  tree.size = values.length
  tree.tree = new Array(values.length + 1).fill(0)

  for (let index = 0; index < values.length; index++) {
    const fenwickIndex = index + 1
    tree.tree[fenwickIndex] += values[index] ?? 0

    const parentIndex = fenwickIndex + (fenwickIndex & -fenwickIndex)
    if (parentIndex <= values.length) {
      tree.tree[parentIndex] += tree.tree[fenwickIndex]
    }
  }
}

function addFenwickTreeValue(tree: FenwickTree, index: number, delta: number): void {
  if (delta === 0 || index < 0 || index >= tree.size) {
    return
  }

  for (let fenwickIndex = index + 1; fenwickIndex <= tree.size; fenwickIndex += fenwickIndex & -fenwickIndex) {
    tree.tree[fenwickIndex] += delta
  }
}

function resolveFenwickTreePrefixSum(tree: FenwickTree, length: number): number {
  let result = 0

  for (let index = clamp(length, 0, tree.size); index > 0; index -= index & -index) {
    result += tree.tree[index] ?? 0
  }

  return result
}

function lowerBoundFenwickTree(tree: FenwickTree, target: number): number {
  if (tree.size === 0 || target <= 0) {
    return 0
  }

  let index = 0
  let prefixSum = 0

  for (let bit = resolveHighestOneBit(tree.size); bit > 0; bit >>= 1) {
    const nextIndex = index + bit
    const nextSum = prefixSum + (tree.tree[nextIndex] ?? 0)
    if (nextIndex <= tree.size && nextSum < target) {
      index = nextIndex
      prefixSum = nextSum
    }
  }

  return Math.min(tree.size, index + 1)
}

function upperBoundFenwickTree(tree: FenwickTree, target: number): number {
  if (tree.size === 0) {
    return 0
  }

  if (target < 0) {
    return 0
  }

  let index = 0
  let prefixSum = 0

  for (let bit = resolveHighestOneBit(tree.size); bit > 0; bit >>= 1) {
    const nextIndex = index + bit
    const nextSum = prefixSum + (tree.tree[nextIndex] ?? 0)
    if (nextIndex <= tree.size && nextSum <= target) {
      index = nextIndex
      prefixSum = nextSum
    }
  }

  return Math.min(tree.size, index + 1)
}

function resolveDynamicSizeLayoutKeys(
  items: unknown[],
  itemKey: RecycleScrollerItemKey,
): {
  indexByKey: Map<RecycleScrollerItemKeyValue, number>
  keys: RecycleScrollerItemKeyValue[]
} {
  const keys: RecycleScrollerItemKeyValue[] = []
  const indexByKey = new Map<RecycleScrollerItemKeyValue, number>()

  for (let index = 0; index < items.length; index++) {
    const key = resolveRecycleScrollerItemKey(items[index], index, itemKey)
    if (indexByKey.has(key)) {
      throw new Error(`DynamicScroller detected duplicate key "${String(key)}" in the items list.`)
    }

    keys.push(key)
    indexByKey.set(key, index)
  }

  return {
    indexByKey,
    keys,
  }
}

function pruneDynamicSizeMeasurements(
  keys: RecycleScrollerItemKeyValue[],
  sizeMap: Map<RecycleScrollerItemKeyValue, number>,
): void {
  const nextKeys = new Set(keys)

  for (const key of sizeMap.keys()) {
    if (!nextKeys.has(key)) {
      sizeMap.delete(key)
    }
  }
}

function createDynamicSizeLayoutSnapshot(cache: DynamicSizeLayoutCache): DynamicSizeLayout {
  const offsets = [0]

  for (let index = 0; index < cache.sizes.length; index++) {
    offsets[index + 1] = offsets[index] + (cache.sizes[index] ?? cache.minItemSize)
  }

  return {
    keys: cache.keys,
    offsets,
    totalSize: cache.totalSize,
  }
}

export function createDynamicSizeLayoutCache(): DynamicSizeLayoutCache {
  return {
    keys: [],
    totalSize: 0,
    firstMeasurementChangeIndex: null,
    fenwickTree: createFenwickTree(),
    indexByKey: new Map<RecycleScrollerItemKeyValue, number>(),
    minItemSize: 0,
    sizes: [],
  }
}

export function snapshotDynamicSizeLayoutCache(cache: DynamicSizeLayoutCache): DynamicSizeLayout {
  return createDynamicSizeLayoutSnapshot(cache)
}

export function syncDynamicSizeLayoutCache(
  cache: DynamicSizeLayoutCache,
  input: ResolveDynamicSizeLayoutInput,
): DynamicSizeLayoutCache {
  const { items, itemKey, minItemSize, sizeMap } = input
  assertValidMinItemSize(minItemSize)

  const { indexByKey, keys } = resolveDynamicSizeLayoutKeys(items, itemKey)

  pruneDynamicSizeMeasurements(keys, sizeMap)

  cache.keys = keys
  cache.indexByKey = indexByKey
  cache.minItemSize = minItemSize
  cache.sizes = keys.map((key) => sizeMap.get(key) ?? minItemSize)
  cache.firstMeasurementChangeIndex = null
  buildFenwickTree(cache.fenwickTree, cache.sizes)
  cache.totalSize = resolveFenwickTreePrefixSum(cache.fenwickTree, cache.sizes.length)

  return cache
}

export function recomputeDynamicSizeLayoutCache(
  cache: DynamicSizeLayoutCache,
): DynamicSizeLayoutCache {
  return cache
}

export function updateDynamicSizeMeasurement(
  cache: DynamicSizeLayoutCache,
  sizeMap: Map<RecycleScrollerItemKeyValue, number>,
  key: RecycleScrollerItemKeyValue,
  index: number,
  size: number,
  minItemSize: number,
): DynamicSizeMeasurementResult {
  const currentIndex = cache.indexByKey.get(key)
  const previousSize = currentIndex === undefined
    ? sizeMap.get(key) ?? Math.max(cache.minItemSize, minItemSize)
    : cache.sizes[currentIndex] ?? Math.max(cache.minItemSize, minItemSize)

  if (currentIndex === undefined) {
    if (previousSize !== size) {
      sizeMap.set(key, size)
      return {
        changed: true,
        currentIndex: index,
        previousSize,
        requiresLayoutSync: true,
      }
    }

    return {
      changed: false,
      currentIndex: null,
      previousSize,
      requiresLayoutSync: false,
    }
  }

  if (previousSize === size) {
    return {
      changed: false,
      currentIndex,
      previousSize,
      requiresLayoutSync: false,
    }
  }

  sizeMap.set(key, size)
  cache.sizes[currentIndex] = size
  addFenwickTreeValue(cache.fenwickTree, currentIndex, size - previousSize)
  cache.totalSize += size - previousSize
  cache.firstMeasurementChangeIndex = cache.firstMeasurementChangeIndex === null
    ? currentIndex
    : Math.min(cache.firstMeasurementChangeIndex, currentIndex)

  return {
    changed: true,
    currentIndex,
    previousSize,
    requiresLayoutSync: false,
  }
}

export function resolveDynamicSizeLayout(input: ResolveDynamicSizeLayoutInput): DynamicSizeLayout {
  const cache = createDynamicSizeLayoutCache()
  syncDynamicSizeLayoutCache(cache, input)
  return createDynamicSizeLayoutSnapshot(cache)
}

export function resolveDynamicSizeRange(input: DynamicSizeRangeInput): DynamicSizeRange {
  const { offsets, count, buffer, scrollStart, scrollEnd, beforeSize = 0 } = input
  const contentStart = Math.max(0, scrollStart - beforeSize)
  const contentEnd = Math.max(0, scrollEnd - beforeSize)
  const bufferedStart = Math.max(0, contentStart - buffer)
  const bufferedEnd = Math.max(0, contentEnd + buffer)

  const startIndex = clamp(Math.max(0, upperBound(offsets, bufferedStart) - 1), 0, count)
  const endIndex = clamp(lowerBound(offsets, bufferedEnd), 0, count)
  const visibleStartIndex = clamp(Math.max(0, upperBound(offsets, contentStart) - 1), 0, count)
  const visibleEndIndex = clamp(lowerBound(offsets, contentEnd), 0, count)

  return {
    startIndex,
    endIndex,
    visibleStartIndex,
    visibleEndIndex,
    totalSize: offsets[count] ?? 0,
  }
}

export function resolveDynamicSizeItemOffset(
  cache: DynamicSizeLayoutCache,
  index: number,
): number {
  return resolveFenwickTreePrefixSum(cache.fenwickTree, clamp(index, 0, cache.keys.length))
}

export interface DynamicSizeRangeFromCacheInput {
  buffer: number
  cache: DynamicSizeLayoutCache
  scrollEnd: number
  scrollStart: number
  beforeSize?: number
}

export function resolveDynamicSizeRangeFromCache(input: DynamicSizeRangeFromCacheInput): DynamicSizeRange {
  const { buffer, cache, scrollEnd, scrollStart, beforeSize = 0 } = input
  const contentStart = Math.max(0, scrollStart - beforeSize)
  const contentEnd = Math.max(0, scrollEnd - beforeSize)
  const bufferedStart = Math.max(0, contentStart - buffer)
  const bufferedEnd = Math.max(0, contentEnd + buffer)
  const count = cache.keys.length

  const startIndex = clamp(Math.max(0, upperBoundFenwickTree(cache.fenwickTree, bufferedStart) - 1), 0, count)
  const endIndex = clamp(lowerBoundFenwickTree(cache.fenwickTree, bufferedEnd), 0, count)
  const visibleStartIndex = clamp(Math.max(0, upperBoundFenwickTree(cache.fenwickTree, contentStart) - 1), 0, count)
  const visibleEndIndex = clamp(lowerBoundFenwickTree(cache.fenwickTree, contentEnd), 0, count)

  return {
    startIndex,
    endIndex,
    visibleStartIndex,
    visibleEndIndex,
    totalSize: cache.totalSize,
  }
}

export function resolveAnchorScrollDelta(
  changedIndex: number,
  visibleStartIndex: number,
  previousSize: number,
  nextSize: number,
): number {
  if (changedIndex >= visibleStartIndex) {
    return 0
  }

  return nextSize - previousSize
}
