import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

import type {
  DynamicSizeRange,
  RecycleScrollerItemKey,
  RecycleScrollerItemKeyValue,
  RecycleScrollerMeasurementState,
  RecycleScrollerView,
  RecycleScrollerUpdateReason,
  ScrollState,
} from '../types/recycle-scroller'

import { createRecycleScrollerUpdateScheduler } from './recycle-scroller/controller'
import {
  resolveRecycleScrollerItemKey,
  resolveRecycleScrollerItemKeys,
  warnDuplicateRecycleScrollerItemKeys,
} from './recycle-scroller/key'
import {
  observeRecycleScrollerMeasurements,
  readRecycleScrollerMeasurement,
  scrollRecycleScrollerToPosition,
} from './recycle-scroller/measurement'
import { createRecycleScrollerReuseStore } from './recycle-scroller/reuse'
import {
  assertRenderWindowWithinLimit,
  resolveItemStyle,
  resolveViewportItemCapacity,
  resolveWrapperStyle,
} from './recycle-scroller/range'
import {
  assertValidMinItemSize,
  createDynamicSizeLayoutCache,
  recomputeDynamicSizeLayoutCache,
  resolveAnchorScrollDelta,
  resolveDynamicSizeItemOffset,
  resolveDynamicSizeRange,
  resolveDynamicSizeRangeFromCache,
  syncDynamicSizeLayoutCache,
  updateDynamicSizeMeasurement,
} from './dynamic-scroller/range'

export interface UseDynamicScrollerOptions {
  items: unknown[]
  minItemSize: number
  itemKey: RecycleScrollerItemKey
  buffer: number
  direction: 'vertical'
}

export interface UseDynamicScrollerReturn {
  handleScroll: () => void
  measurement: Ref<RecycleScrollerMeasurementState>
  visibleViews: Ref<RecycleScrollerView[]>
  totalSize: Ref<number>
  ready: Ref<boolean>
  getScroll: () => ScrollState
  scrollToItem: (index: number) => void
  scrollToPosition: (position: number) => void
  updateVisibleItems: () => void
  reportItemSize: (item: unknown, index: number, size: number) => void
  resolveItemKey: (item: unknown, index: number) => RecycleScrollerItemKeyValue
}

export {
  assertValidMinItemSize,
  resolveAnchorScrollDelta,
  resolveDynamicSizeRange,
  resolveItemStyle,
  resolveRecycleScrollerItemKey,
  resolveWrapperStyle,
}

function isSameDynamicSizeRange(
  previous: DynamicSizeRange | null,
  next: DynamicSizeRange,
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

function hasUnmeasuredPredecessorsInWindow(
  keys: RecycleScrollerItemKeyValue[],
  sizeMap: Map<RecycleScrollerItemKeyValue, number>,
  startIndex: number,
  targetIndex: number,
): boolean {
  for (let index = startIndex; index < targetIndex; index++) {
    if (!sizeMap.has(keys[index])) {
      return true
    }
  }

  return false
}

function haveDynamicItemKeysChanged(
  previous: RecycleScrollerItemKeyValue[],
  next: RecycleScrollerItemKeyValue[],
): boolean {
  if (previous.length !== next.length) {
    return true
  }

  for (let index = 0; index < next.length; index++) {
    if (previous[index] !== next[index]) {
      return true
    }
  }

  return false
}

export function useDynamicScroller(
  options: UseDynamicScrollerOptions,
  containerRef: Ref<HTMLElement | undefined>,
  beforeRef: Ref<HTMLElement | undefined>,
): UseDynamicScrollerReturn {
  const totalSize = ref(0)
  const ready = ref(false)
  const measurement = ref<RecycleScrollerMeasurementState>({
    beforeSize: 0,
    viewportSize: 0,
    scroll: { start: 0, end: 0 },
  })

  const reuseStore = createRecycleScrollerReuseStore()
  const scheduler = createRecycleScrollerUpdateScheduler()
  const sizeMap = new Map<RecycleScrollerItemKeyValue, number>()
  const layoutCache = createDynamicSizeLayoutCache()
  let stopObserving: () => void = () => undefined
  let mounted = false
  let currentRange: DynamicSizeRange | null = null
  let currentEffectiveKeys: RecycleScrollerItemKeyValue[] = []
  let layoutStructureDirty = true
  let pendingScrollTarget: { index: number } | null = null
  let pendingDuplicateKeyWarning = true
  let visibleEntriesDirty = true

  function readMeasurement(): RecycleScrollerMeasurementState {
    return readRecycleScrollerMeasurement(
      containerRef.value,
      beforeRef.value,
      options.direction,
    )
  }

  function resolveItemKey(item: unknown, index: number): RecycleScrollerItemKeyValue {
    return currentEffectiveKeys[index] ?? resolveRecycleScrollerItemKey(item, index, options.itemKey)
  }

  function resolveMeasurementItemKey(item: unknown, index: number): RecycleScrollerItemKeyValue {
    if (options.items[index] === item) {
      return resolveRecycleScrollerItemKeys(options.items, options.itemKey).effectiveKeys[index]
        ?? resolveItemKey(item, index)
    }

    return resolveItemKey(item, index)
  }

  function resolveLayout() {
    if (layoutStructureDirty) {
      const layout = syncDynamicSizeLayoutCache(layoutCache, {
        items: options.items,
        itemKey: options.itemKey,
        minItemSize: options.minItemSize,
        sizeMap,
      })
      layoutStructureDirty = false
      return layout
    }

    return recomputeDynamicSizeLayoutCache(layoutCache)
  }

  function reconcilePendingScrollTarget(
    layout: ReturnType<typeof resolveLayout>,
    nextMeasurement: RecycleScrollerMeasurementState,
    range: DynamicSizeRange,
  ): void {
    if (!pendingScrollTarget || !options.items.length) {
      pendingScrollTarget = null
      return
    }

    const safeIndex = Math.min(Math.max(pendingScrollTarget.index, 0), options.items.length - 1)
    const targetOffset = resolveDynamicSizeItemOffset(layout, safeIndex) + nextMeasurement.beforeSize
    const targetKey = layout.keys[safeIndex]
    const targetInWindow = safeIndex >= range.startIndex && safeIndex < range.endIndex
    const targetMeasured = targetKey !== undefined && sizeMap.has(targetKey)
    const hasUnmeasuredPredecessors = targetInWindow && hasUnmeasuredPredecessorsInWindow(
      layout.keys,
      sizeMap,
      range.startIndex,
      safeIndex,
    )

    if (Math.abs(targetOffset - nextMeasurement.scroll.start) <= 1) {
      if (targetMeasured && !hasUnmeasuredPredecessors) {
        pendingScrollTarget = null
      }
      return
    }

    scrollRecycleScrollerToPosition(
      containerRef.value,
      options.direction,
      targetOffset,
    )
    scheduleUpdate('scroll')
  }

  function commit(reason: RecycleScrollerUpdateReason): void {
    assertValidMinItemSize(options.minItemSize)
    const nextMeasurement = readMeasurement()

    if (pendingDuplicateKeyWarning) {
      const resolvedItemKeys = resolveRecycleScrollerItemKeys(options.items, options.itemKey)
      warnDuplicateRecycleScrollerItemKeys('DynamicScroller', resolvedItemKeys.duplicateCounts)
      pendingDuplicateKeyWarning = false
    }

    const layout = resolveLayout()
    const firstMeasurementChangeIndex = layout.firstMeasurementChangeIndex
    const range = resolveDynamicSizeRangeFromCache({
      cache: layout,
      buffer: options.buffer,
      scrollStart: nextMeasurement.scroll.start,
      scrollEnd: nextMeasurement.scroll.end,
      beforeSize: nextMeasurement.beforeSize,
    })

    assertRenderWindowWithinLimit(range.endIndex - range.startIndex)

    const firstPositionAffectedIndex = firstMeasurementChangeIndex === null
      ? null
      : firstMeasurementChangeIndex + 1
    const renderedPositionsAffected = firstPositionAffectedIndex !== null
      && firstPositionAffectedIndex < range.endIndex

    const canSkipVisibleCommit = (
      (reason === 'scroll' || reason === 'resize')
      && isSameDynamicSizeRange(currentRange, range)
      && totalSize.value === layout.totalSize
      && pendingScrollTarget === null
      && !visibleEntriesDirty
      && !renderedPositionsAffected
    )

    let nextVisibleEntriesDirty = visibleEntriesDirty

    if (!canSkipVisibleCommit) {
      const entries = []
      let position = resolveDynamicSizeItemOffset(layout, range.startIndex)

      for (let index = range.startIndex; index < range.endIndex; index++) {
        entries.push({
          item: options.items[index],
          index,
          key: layout.keys[index],
          active: index >= range.visibleStartIndex && index < range.visibleEndIndex,
          position,
        })

        position += layout.sizes[index] ?? options.minItemSize
      }

      reuseStore.commitVisibleEntries({
        entries,
        recycledViewLimit: (range.endIndex - range.startIndex)
          + resolveViewportItemCapacity(nextMeasurement.viewportSize, options.minItemSize),
      })
      nextVisibleEntriesDirty = false
    }

    measurement.value = nextMeasurement
    totalSize.value = layout.totalSize
    currentEffectiveKeys = layout.keys.slice()
    visibleEntriesDirty = nextVisibleEntriesDirty
    layout.firstMeasurementChangeIndex = null
    currentRange = range
    reconcilePendingScrollTarget(layout, nextMeasurement, range)

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
    pendingScrollTarget = null
    scrollRecycleScrollerToPosition(
      containerRef.value,
      options.direction,
      position,
    )
    updateVisibleItems()
  }

  function scrollToItem(index: number): void {
    if (!options.items.length) {
      pendingScrollTarget = null
      return
    }

    const nextMeasurement = readMeasurement()
    const safeIndex = Math.min(Math.max(index, 0), options.items.length - 1)
    const layout = resolveLayout()

    pendingScrollTarget = { index: safeIndex }
    scrollToPosition(resolveDynamicSizeItemOffset(layout, safeIndex) + nextMeasurement.beforeSize)
    pendingScrollTarget = { index: safeIndex }
    scheduleUpdate('scroll')
  }

  function reportItemSize(item: unknown, index: number, size: number): void {
    if (!Number.isFinite(size) || size <= 0) {
      return
    }

    const key = resolveMeasurementItemKey(item, index)
    const measurementResult = updateDynamicSizeMeasurement(
      layoutCache,
      sizeMap,
      key,
      index,
      size,
      options.minItemSize,
    )

    if (!measurementResult.changed) {
      return
    }

    if (measurementResult.requiresLayoutSync) {
      layoutStructureDirty = true
      visibleEntriesDirty = true
    }

    if (currentRange) {
      const delta = resolveAnchorScrollDelta(
        measurementResult.currentIndex ?? index,
        currentRange.visibleStartIndex,
        measurementResult.previousSize,
        size,
      )
      if (delta !== 0) {
        scrollRecycleScrollerToPosition(
          containerRef.value,
          options.direction,
          getScroll().start + delta,
        )
      }
    }

    scheduleUpdate('resize')
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
    () => resolveRecycleScrollerItemKeys(options.items, options.itemKey).effectiveKeys,
    (nextKeys, previousKeys) => {
      if (haveDynamicItemKeysChanged(previousKeys ?? [], nextKeys)) {
        layoutStructureDirty = true
        visibleEntriesDirty = true
        pendingDuplicateKeyWarning = true
      }
      scheduleUpdate('items')
    },
  )

  watch(
    () => [options.minItemSize, options.itemKey] as const,
    ([, nextItemKey], [, previousItemKey]) => {
      layoutStructureDirty = true
      visibleEntriesDirty = true
      if (nextItemKey !== previousItemKey) {
        pendingDuplicateKeyWarning = true
      }
      scheduleUpdate('props')
    },
  )

  watch(
    () => [options.buffer, options.direction] as const,
    () => {
      scheduleUpdate('props')
    },
  )

  return {
    handleScroll,
    measurement,
    visibleViews: reuseStore.visibleViews,
    totalSize,
    ready,
    getScroll,
    scrollToItem,
    scrollToPosition,
    updateVisibleItems,
    reportItemSize,
    resolveItemKey,
  }
}
