import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'

import type {
  PullToRefreshHandler,
  PullToRefreshState,
  ScrollDirection,
} from '../../types/recycle-scroller'

export const DEFAULT_PULL_TO_REFRESH_THRESHOLD = 72
export const DEFAULT_PULL_TO_REFRESH_HOLD = 56
export const DEFAULT_PULL_TO_REFRESH_SETTLE_DELAY = 180

interface TouchPointLike {
  clientY: number
}

interface TouchEventLike {
  cancelable?: boolean
  changedTouches?: ArrayLike<TouchPointLike>
  preventDefault?: () => void
  touches?: ArrayLike<TouchPointLike>
}

export interface UsePullToRefreshOptions {
  direction: Ref<ScrollDirection>
  enabled: Ref<boolean>
  getScrollStart: () => number
  hold: Ref<number>
  onRefresh: Ref<PullToRefreshHandler | undefined>
  threshold: Ref<number>
}

export interface UsePullToRefreshReturn {
  handleTouchcancel: (event: Event) => void
  handleTouchend: (event: Event) => void
  handleTouchmove: (event: Event) => void
  handleTouchstart: (event: Event) => void
  isEnabled: ComputedRef<boolean>
  refreshInset: Ref<number>
  refreshState: Ref<PullToRefreshState>
}

export function assertValidPullToRefreshConfig(
  componentName: string,
  enabled: boolean,
  direction: ScrollDirection,
  threshold: number,
  hold: number,
  onRefresh?: PullToRefreshHandler,
): void {
  if (!enabled) {
    return
  }

  if (direction !== 'vertical') {
    throw new Error(`${componentName} pullToRefresh currently supports only vertical direction.`)
  }

  if (typeof onRefresh !== 'function') {
    throw new Error(`${componentName} requires onRefresh when pullToRefresh is enabled.`)
  }

  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`${componentName} requires a positive pullToRefreshThreshold when pullToRefresh is enabled.`)
  }

  if (!Number.isFinite(hold) || hold <= 0) {
    throw new Error(`${componentName} requires a positive pullToRefreshHold when pullToRefresh is enabled.`)
  }
}

function resolveTouchPoint(event: Event): TouchPointLike | null {
  const touchEvent = event as TouchEventLike
  const currentTouch = touchEvent.touches?.[0]
  if (currentTouch && Number.isFinite(currentTouch.clientY)) {
    return currentTouch
  }

  const changedTouch = touchEvent.changedTouches?.[0]
  if (changedTouch && Number.isFinite(changedTouch.clientY)) {
    return changedTouch
  }

  return null
}

export function usePullToRefresh(options: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const refreshState = ref<PullToRefreshState>('idle')
  const refreshInset = ref(0)
  const isEnabled = computed(() => options.enabled.value)
  const gestureStartY = ref(0)
  const trackingGesture = ref(false)
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  function clearSettleTimer(): void {
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  function resetToIdle(): void {
    trackingGesture.value = false
    clearSettleTimer()
    refreshInset.value = 0
    refreshState.value = 'idle'
  }

  function settleToIdle(): void {
    trackingGesture.value = false
    clearSettleTimer()

    if (refreshInset.value === 0) {
      refreshState.value = 'idle'
      return
    }

    refreshState.value = 'settling'
    refreshInset.value = 0
    settleTimer = setTimeout(() => {
      settleTimer = null
      refreshState.value = 'idle'
    }, DEFAULT_PULL_TO_REFRESH_SETTLE_DELAY)
  }

  async function startRefresh(): Promise<void> {
    clearSettleTimer()
    trackingGesture.value = false
    refreshState.value = 'refreshing'
    refreshInset.value = options.hold.value

    try {
      await Promise.resolve(options.onRefresh.value?.())
    }
    catch {
      // Refresh failures are handled as part of the lifecycle; consumers own their own error reporting.
    }
    finally {
      settleToIdle()
    }
  }

  function handleTouchstart(event: Event): void {
    if (!isEnabled.value || refreshState.value === 'refreshing' || refreshState.value === 'settling') {
      return
    }

    if (options.direction.value !== 'vertical' || options.getScrollStart() > 0) {
      trackingGesture.value = false
      return
    }

    const point = resolveTouchPoint(event)
    if (!point) {
      return
    }

    clearSettleTimer()
    trackingGesture.value = true
    gestureStartY.value = point.clientY
    refreshInset.value = 0
    refreshState.value = 'idle'
  }

  function handleTouchmove(event: Event): void {
    if (!trackingGesture.value || !isEnabled.value || options.direction.value !== 'vertical') {
      return
    }

    if (options.getScrollStart() > 0) {
      resetToIdle()
      return
    }

    const point = resolveTouchPoint(event)
    if (!point) {
      return
    }

    const delta = point.clientY - gestureStartY.value

    if (delta <= 0) {
      resetToIdle()
      return
    }

    const touchEvent = event as TouchEventLike
    if (touchEvent.cancelable) {
      touchEvent.preventDefault?.()
    }

    refreshInset.value = Math.round(delta)
    refreshState.value = refreshInset.value >= options.threshold.value ? 'armed' : 'pulling'
  }

  function handleTouchend(): void {
    if (!trackingGesture.value) {
      return
    }

    if (refreshState.value === 'armed') {
      void startRefresh()
      return
    }

    settleToIdle()
  }

  function handleTouchcancel(): void {
    if (!trackingGesture.value) {
      return
    }

    settleToIdle()
  }

  watch(isEnabled, (enabled) => {
    if (!enabled) {
      resetToIdle()
    }
  })

  onBeforeUnmount(() => {
    clearSettleTimer()
  })

  return {
    handleTouchcancel,
    handleTouchend,
    handleTouchmove,
    handleTouchstart,
    isEnabled,
    refreshInset,
    refreshState,
  }
}
