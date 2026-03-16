import type { RecycleScrollerUpdateReason } from '../../types/recycle-scroller'

export interface RecycleScrollerUpdateScheduler {
  cancel: () => void
  flush: (reason: RecycleScrollerUpdateReason, task: (reason: RecycleScrollerUpdateReason) => void) => void
  schedule: (reason: RecycleScrollerUpdateReason, task: (reason: RecycleScrollerUpdateReason) => void) => void
}

function resolveAnimationFrame(): typeof requestAnimationFrame | null {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame.bind(globalThis)
  }

  return null
}

function resolveCancelAnimationFrame(): typeof cancelAnimationFrame | null {
  if (typeof cancelAnimationFrame === 'function') {
    return cancelAnimationFrame.bind(globalThis)
  }

  return null
}

export function mergeRecycleScrollerUpdateReason(
  current: RecycleScrollerUpdateReason | null,
  next: RecycleScrollerUpdateReason,
): RecycleScrollerUpdateReason {
  if (!current || current === 'scroll') {
    return next
  }

  return current
}

export function createRecycleScrollerUpdateScheduler(): RecycleScrollerUpdateScheduler {
  const requestFrame = resolveAnimationFrame()
  const cancelFrame = resolveCancelAnimationFrame()
  let frameId: number | null = null
  let pendingReason: RecycleScrollerUpdateReason | null = null

  const cancel = (): void => {
    if (frameId !== null && cancelFrame) {
      cancelFrame(frameId)
    }

    frameId = null
    pendingReason = null
  }

  const flush = (
    reason: RecycleScrollerUpdateReason,
    task: (reason: RecycleScrollerUpdateReason) => void,
  ): void => {
    cancel()
    task(reason)
  }

  const schedule = (
    reason: RecycleScrollerUpdateReason,
    task: (reason: RecycleScrollerUpdateReason) => void,
  ): void => {
    pendingReason = mergeRecycleScrollerUpdateReason(pendingReason, reason)

    if (!requestFrame) {
      const nextReason = pendingReason
      pendingReason = null
      task(nextReason ?? reason)
      return
    }

    if (frameId !== null) {
      return
    }

    frameId = requestFrame(() => {
      frameId = null
      const nextReason = pendingReason ?? reason
      pendingReason = null
      task(nextReason)
    })
  }

  return {
    cancel,
    flush,
    schedule,
  }
}
