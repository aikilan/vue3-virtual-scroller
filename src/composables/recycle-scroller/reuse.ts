import { ref, shallowReactive, type Ref } from 'vue'

import type {
  RecycleScrollerView,
  RecycleScrollerVisibleEntry,
} from '../../types/recycle-scroller'

export interface CommitVisibleEntriesOptions {
  entries: RecycleScrollerVisibleEntry[]
  recycledViewLimit: number
}

export interface RecycleScrollerReuseStore {
  visibleViews: Ref<RecycleScrollerView[]>
  commitVisibleEntries: (options: CommitVisibleEntriesOptions) => { continuous: boolean }
}

let nextViewId = 0

function createView(entry: RecycleScrollerVisibleEntry): RecycleScrollerView {
  return shallowReactive({
    viewId: nextViewId++,
    item: entry.item,
    index: entry.index,
    key: entry.key,
    active: entry.active,
    position: entry.position,
  }) as RecycleScrollerView
}

export function createRecycleScrollerReuseStore(): RecycleScrollerReuseStore {
  const visibleViews = ref<RecycleScrollerView[]>([])
  const viewsByKey = new Map<RecycleScrollerView['key'], RecycleScrollerView>()
  const recycledViews: RecycleScrollerView[] = []
  let previousRange: { startIndex: number, endIndex: number } | null = null

  const recycleView = (view: RecycleScrollerView): void => {
    viewsByKey.delete(view.key)
    recycledViews.push(view)
  }

  const recycleAllViews = (): void => {
    for (const view of visibleViews.value) {
      recycleView(view)
    }
  }

  const trimRecycledViews = (limit: number): void => {
    if (recycledViews.length > limit) {
      recycledViews.length = limit
    }
  }

  const assignEntryToView = (
    view: RecycleScrollerView,
    entry: RecycleScrollerVisibleEntry,
  ): RecycleScrollerView => {
    view.item = entry.item
    view.index = entry.index
    view.key = entry.key
    view.active = entry.active
    view.position = entry.position
    return view
  }

  const commitVisibleEntries = ({
    entries,
    recycledViewLimit,
  }: CommitVisibleEntriesOptions): { continuous: boolean } => {
    const nextStart = entries[0]?.index ?? 0
    const nextEnd = entries.length > 0 ? entries[entries.length - 1].index + 1 : nextStart
    const range = {
      startIndex: nextStart,
      endIndex: nextEnd,
    }
    const continuous = previousRange !== null
      && range.startIndex <= previousRange.endIndex
      && range.endIndex >= previousRange.startIndex

    const nextKeys = new Set(entries.map((entry) => entry.key))

    if (!continuous) {
      recycleAllViews()
    }
    else {
      for (const view of visibleViews.value) {
        if (!nextKeys.has(view.key)) {
          recycleView(view)
        }
      }
    }

    const nextVisibleViews: RecycleScrollerView[] = []

    for (const entry of entries) {
      let view = viewsByKey.get(entry.key)
      if (!view) {
        view = recycledViews.pop()
        if (view) {
          assignEntryToView(view, entry)
        }
        else {
          view = createView(entry)
        }

        viewsByKey.set(entry.key, view)
      }
      else {
        assignEntryToView(view, entry)
      }

      nextVisibleViews.push(view)
    }

    visibleViews.value = nextVisibleViews
    previousRange = range
    trimRecycledViews(recycledViewLimit)

    return { continuous }
  }

  return {
    visibleViews,
    commitVisibleEntries,
  }
}
