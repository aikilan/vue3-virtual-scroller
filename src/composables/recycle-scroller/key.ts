import type { RecycleScrollerItemKey, RecycleScrollerItemKeyValue } from '../../types/recycle-scroller'

export interface ResolvedRecycleScrollerItemKeys {
  duplicateCounts: Map<RecycleScrollerItemKeyValue, number>
  effectiveKeys: RecycleScrollerItemKeyValue[]
  indexByKey: Map<RecycleScrollerItemKeyValue, number>
  rawKeys: RecycleScrollerItemKeyValue[]
}

function assertValidItemKeyValue(value: unknown, message: string): asserts value is RecycleScrollerItemKeyValue {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(message)
  }
}

export function resolveRecycleScrollerItemKey(
  item: unknown,
  index: number,
  itemKey: RecycleScrollerItemKey,
): RecycleScrollerItemKeyValue {
  if (typeof itemKey === 'function') {
    const value = itemKey(item, index)
    assertValidItemKeyValue(
      value,
      'RecycleScroller itemKey function must return a string or number.',
    )
    return value
  }

  if (typeof item !== 'object' || item === null) {
    throw new Error('RecycleScroller requires itemKey as a function when list items are not objects.')
  }

  const value = Reflect.get(item as object, itemKey)
  assertValidItemKeyValue(
    value,
    `RecycleScroller could not resolve a stable key from field "${itemKey}".`,
  )
  return value
}

function resolveSyntheticKey(
  rawKey: RecycleScrollerItemKeyValue,
  startSuffix: number,
  rawKeySet: Set<RecycleScrollerItemKeyValue>,
  usedKeys: Set<RecycleScrollerItemKeyValue>,
): RecycleScrollerItemKeyValue {
  let suffix = startSuffix

  while (true) {
    const candidate = `${String(rawKey)}_${suffix}`
    if (!rawKeySet.has(candidate) && !usedKeys.has(candidate)) {
      return candidate
    }
    suffix += 1
  }
}

export function resolveRecycleScrollerItemKeys(
  items: unknown[],
  itemKey: RecycleScrollerItemKey,
): ResolvedRecycleScrollerItemKeys {
  const rawKeys = items.map((item, index) => resolveRecycleScrollerItemKey(item, index, itemKey))
  const rawKeySet = new Set<RecycleScrollerItemKeyValue>(rawKeys)
  const totalCounts = new Map<RecycleScrollerItemKeyValue, number>()

  for (const rawKey of rawKeys) {
    totalCounts.set(rawKey, (totalCounts.get(rawKey) ?? 0) + 1)
  }

  const duplicateCounts = new Map<RecycleScrollerItemKeyValue, number>()
  for (const [rawKey, count] of totalCounts.entries()) {
    if (count > 1) {
      duplicateCounts.set(rawKey, count)
    }
  }

  const effectiveKeys: RecycleScrollerItemKeyValue[] = []
  const indexByKey = new Map<RecycleScrollerItemKeyValue, number>()
  const occurrenceCounts = new Map<RecycleScrollerItemKeyValue, number>()
  const usedKeys = new Set<RecycleScrollerItemKeyValue>()

  for (let index = 0; index < rawKeys.length; index++) {
    const rawKey = rawKeys[index]
    const occurrence = occurrenceCounts.get(rawKey) ?? 0
    const effectiveKey = occurrence === 0
      ? rawKey
      : resolveSyntheticKey(rawKey, occurrence, rawKeySet, usedKeys)

    occurrenceCounts.set(rawKey, occurrence + 1)
    effectiveKeys.push(effectiveKey)
    indexByKey.set(effectiveKey, index)
    usedKeys.add(effectiveKey)
  }

  return {
    duplicateCounts,
    effectiveKeys,
    indexByKey,
    rawKeys,
  }
}

export function warnDuplicateRecycleScrollerItemKeys(
  componentName: string,
  duplicateCounts: Map<RecycleScrollerItemKeyValue, number>,
): void {
  if (!import.meta.env.DEV || duplicateCounts.size === 0) {
    return
  }

  const duplicates = Array.from(duplicateCounts.entries())
    .map(([key, count]) => `"${String(key)}" x${count}`)
    .join(', ')

  console.warn(
    `${componentName} detected duplicate itemKey values (${duplicates}). `
    + 'Using synthesized internal keys to keep the render tree stable.',
  )
}
