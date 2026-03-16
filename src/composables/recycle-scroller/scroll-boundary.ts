import type { ScrollBoundaryPayload, ScrollState } from '../../types/recycle-scroller'

const SCROLL_BOUNDARY_TOLERANCE = 1

export function resolveScrollBoundaryPayload(
  reached: boolean,
  scroll: ScrollState,
): ScrollBoundaryPayload {
  return {
    reached,
    scroll: {
      start: scroll.start,
      end: scroll.end,
    },
  }
}

export function resolveVerticalScrollBoundaryState(
  element: HTMLElement | undefined,
  scroll: ScrollState,
): {
  topReached: boolean
  endReached: boolean
} {
  if (!element) {
    return {
      topReached: false,
      endReached: false,
    }
  }

  const remainingDistance = Math.max(0, element.scrollHeight - element.clientHeight - scroll.start)

  return {
    topReached: scroll.start <= SCROLL_BOUNDARY_TOLERANCE,
    endReached: remainingDistance <= SCROLL_BOUNDARY_TOLERANCE,
  }
}
