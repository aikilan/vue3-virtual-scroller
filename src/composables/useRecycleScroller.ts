import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

import type {
  FixedHeightRange,
  RecycleScrollerItemKey,
  RecycleScrollerMeasurementState,
  RecycleScrollerView,
  RecycleScrollerUpdateReason,
  ScrollDirection,
  ScrollState,
} from '../types/recycle-scroller'

import {
  createRecycleScrollerUpdateScheduler,
} from './recycle-scroller/controller'
import { resolveRecycleScrollerItemKey } from './recycle-scroller/key'
import {
  observeRecycleScrollerMeasurements,
  readRecycleScrollerMeasurement,
  scrollRecycleScrollerToPosition,
} from './recycle-scroller/measurement'
import { createRecycleScrollerReuseStore } from './recycle-scroller/reuse'
import {
  assertRenderWindowWithinLimit,
  assertValidItemSize,
  clamp,
  resolveFixedHeightRange,
  resolveItemStyle,
  resolveViewportItemCapacity,
  resolveWrapperStyle,
} from './recycle-scroller/range'

export interface UseRecycleScrollerOptions {
  items: unknown[]
  itemSize: number
  itemKey: RecycleScrollerItemKey
  buffer: number
  direction: ScrollDirection
}

export interface UseRecycleScrollerReturn {
  handleScroll: () => void
  visibleViews: Ref<RecycleScrollerView[]>
  totalSize: Ref<number>
  ready: Ref<boolean>
  getScroll: () => ScrollState
  scrollToItem: (index: number) => void
  scrollToPosition: (position: number) => void
  updateVisibleItems: () => void
}

export {
  assertValidItemSize,
  resolveFixedHeightRange,
  resolveItemStyle,
  resolveRecycleScrollerItemKey,
  resolveWrapperStyle,
}

function detectDuplicateVisibleKeys(keys: Set<string | number>, key: string | number): void {
  if (keys.has(key)) {
    throw new Error(`RecycleScroller detected duplicate key "${String(key)}" in the visible window.`)
  }

  keys.add(key)
}

function isSameFixedHeightRange(
  previous: FixedHeightRange | null,
  next: FixedHeightRange,
): boolean {
  if (!previous) {
    return false
  }

  return previous.startIndex === next.startIndex
    && previous.endIndex === next.endIndex
    && previous.visibleStartIndex === next.visibleStartIndex
    && previous.visibleEndIndex === next.visibleEndIndex
    && previous.totalSize === next.totalSize
}

export function useRecycleScroller(
  options: UseRecycleScrollerOptions,
  containerRef: Ref<HTMLElement | undefined>,
  beforeRef: Ref<HTMLElement | undefined>,
): UseRecycleScrollerReturn {
  const totalSize = ref(0)
  const ready = ref(false)
  const measurement = ref<RecycleScrollerMeasurementState>({
    beforeSize: 0,
    viewportSize: 0,
    scroll: { start: 0, end: 0 },
  })

  const reuseStore = createRecycleScrollerReuseStore()
  const scheduler = createRecycleScrollerUpdateScheduler()
  let stopObserving: () => void = () => undefined
  let mounted = false
  let currentRange: FixedHeightRange | null = null

  function readMeasurement(): RecycleScrollerMeasurementState {
    measurement.value = readRecycleScrollerMeasurement(
      containerRef.value,
      beforeRef.value,
      options.direction,
    )

    return measurement.value
  }

  function buildVisibleEntries(
    startIndex: number,
    endIndex: number,
    visibleStartIndex: number,
    visibleEndIndex: number,
  ) {
    const entries = []
    const visibleKeys = new Set<string | number>()

    for (let index = startIndex; index < endIndex; index++) {
      const item = options.items[index]
      const key = resolveRecycleScrollerItemKey(item, index, options.itemKey)
      detectDuplicateVisibleKeys(visibleKeys, key)
      entries.push({
        item,
        index,
        key,
        active: index >= visibleStartIndex && index < visibleEndIndex,
        position: index * options.itemSize,
      })
    }

    return entries
  }

  function commit(reason: RecycleScrollerUpdateReason): void {
    assertValidItemSize(options.itemSize)

    const nextMeasurement = readMeasurement()
    const range = resolveFixedHeightRange({
      count: options.items.length,
      itemSize: options.itemSize,
      buffer: options.buffer,
      scrollStart: nextMeasurement.scroll.start,
      scrollEnd: nextMeasurement.scroll.end,
      beforeSize: nextMeasurement.beforeSize,
    })

    assertRenderWindowWithinLimit(range.endIndex - range.startIndex)

    totalSize.value = range.totalSize

    if (
      (reason === 'scroll' || reason === 'resize')
      && isSameFixedHeightRange(currentRange, range)
    ) {
      if (!ready.value) {
        ready.value = true
      }
      return
    }

    const visibleEntries = buildVisibleEntries(
      range.startIndex,
      range.endIndex,
      range.visibleStartIndex,
      range.visibleEndIndex,
    )
    const recycledViewLimit = (range.endIndex - range.startIndex)
      + resolveViewportItemCapacity(nextMeasurement.viewportSize, options.itemSize)

    reuseStore.commitVisibleEntries({
      entries: visibleEntries,
      recycledViewLimit,
    })

    currentRange = range

    if (!ready.value) {
      ready.value = true
    }
  }

  function scheduleUpdate(reason: RecycleScrollerUpdateReason): void {
    scheduler.schedule(reason, commit)
  }

  function handleScroll(): void {
    scheduleUpdate('scroll')
  }

  function restartObservers(): void {
    stopObserving()
    stopObserving = observeRecycleScrollerMeasurements(
      containerRef.value,
      beforeRef.value,
      () => {
        scheduleUpdate('resize')
      },
    )
  }

  function getScroll(): ScrollState {
    return readMeasurement().scroll
  }

  function updateVisibleItems(): void {
    scheduler.flush('manual', commit)
  }

  function scrollToPosition(position: number): void {
    scrollRecycleScrollerToPosition(
      containerRef.value,
      options.direction,
      position,
    )
    updateVisibleItems()
  }

  function scrollToItem(index: number): void {
    if (!options.items.length) {
      return
    }

    const nextMeasurement = readMeasurement()
    const safeIndex = clamp(index, 0, options.items.length - 1)
    scrollToPosition(safeIndex * options.itemSize + nextMeasurement.beforeSize)
  }

  onMounted(() => {
    mounted = true
    restartObservers()
    updateVisibleItems()
  })

  onBeforeUnmount(() => {
    scheduler.cancel()
    stopObserving()
  })

  watch(
    () => [containerRef.value, beforeRef.value, options.direction] as const,
    ([nextContainer, nextBefore, nextDirection], [previousContainer, previousBefore, previousDirection]) => {
      if (!mounted) {
        return
      }

      restartObservers()

      const isInitialRefBinding = previousContainer == null
        && nextContainer != null
        && previousDirection === nextDirection
        && (previousBefore == null || previousBefore === nextBefore)

      if (isInitialRefBinding) {
        return
      }

      scheduleUpdate('resize')
    },
    { flush: 'post' },
  )

  watch(
    () => options.items,
    () => {
      scheduleUpdate('items')
    },
  )

  watch(
    () => options.items.length,
    () => {
      scheduleUpdate('items')
    },
  )

  watch(
    () => [options.itemSize, options.buffer, options.direction, options.itemKey] as const,
    () => {
      scheduleUpdate('props')
    },
  )

  return {
    handleScroll,
    visibleViews: reuseStore.visibleViews,
    totalSize,
    ready,
    getScroll,
    scrollToItem,
    scrollToPosition,
    updateVisibleItems,
  }
}
