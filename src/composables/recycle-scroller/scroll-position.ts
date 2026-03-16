import type {
  RecycleScrollerView,
  ScrollPositionItem,
  ScrollPositionPayload,
} from '../../types/recycle-scroller'

function isSameScrollPositionItem(
  previous: ScrollPositionItem | null,
  next: ScrollPositionItem | null,
): boolean {
  if (previous === next) {
    return true
  }

  if (previous == null || next == null) {
    return previous === next
  }

  return previous.index === next.index && previous.item === next.item
}

export function isSameScrollPositionPayload(
  previous: ScrollPositionPayload | null,
  next: ScrollPositionPayload,
): boolean {
  if (previous == null) {
    return false
  }

  return isSameScrollPositionItem(previous.first, next.first)
    && isSameScrollPositionItem(previous.last, next.last)
}

export function resolveScrollPositionPayload(
  visibleViews: RecycleScrollerView[],
): ScrollPositionPayload {
  let first: ScrollPositionItem | null = null
  let last: ScrollPositionItem | null = null

  for (const view of visibleViews) {
    if (!view.active) {
      continue
    }

    const item = {
      index: view.index,
      item: view.item,
    }

    if (first == null) {
      first = item
    }

    last = item
  }

  return {
    first,
    last,
  }
}
