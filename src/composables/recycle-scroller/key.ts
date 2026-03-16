import type { RecycleScrollerItemKey, RecycleScrollerItemKeyValue } from '../../types/recycle-scroller'

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
