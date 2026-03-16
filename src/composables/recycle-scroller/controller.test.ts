import { describe, expect, it, vi } from 'vitest'

import {
  createRecycleScrollerUpdateScheduler,
  mergeRecycleScrollerUpdateReason,
} from './controller'

const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

describe('recycle-scroller controller', () => {
  it('coalesces multiple updates into a single animation frame', () => {
    const callbacks: FrameRequestCallback[] = []

    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const scheduler = createRecycleScrollerUpdateScheduler()
    const reasons: string[] = []

    scheduler.schedule('scroll', (reason) => {
      reasons.push(reason)
    })
    scheduler.schedule('scroll', (reason) => {
      reasons.push(reason)
    })
    scheduler.schedule('resize', (reason) => {
      reasons.push(reason)
    })

    expect(callbacks).toHaveLength(1)
    callbacks[0](16)

    expect(reasons).toEqual(['resize'])

    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    }
    else {
      delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame
    }

    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
    else {
      delete (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame
    }
  })

  it('preserves the first non-scroll reason in a coalesced frame', () => {
    expect(mergeRecycleScrollerUpdateReason(null, 'scroll')).toBe('scroll')
    expect(mergeRecycleScrollerUpdateReason('scroll', 'resize')).toBe('resize')
    expect(mergeRecycleScrollerUpdateReason('resize', 'manual')).toBe('resize')
  })
})
