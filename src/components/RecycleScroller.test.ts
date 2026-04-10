import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import type {
  RecycleScrollerExpose,
  RecycleScrollerRefreshSlotProps,
  ScrollBoundaryPayload,
  ScrollPositionPayload,
} from '../types/recycle-scroller'
import RecycleScroller from './recycle-scroller'

interface MetricOptions {
  clientHeight?: number
  clientWidth?: number
  offsetHeight?: number
  offsetWidth?: number
  scrollHeight?: number
  scrollWidth?: number
  scrollTop?: number
  scrollLeft?: number
}

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []

  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }

  static triggerAll(): void {
    for (const instance of ResizeObserverMock.instances) {
      instance.trigger()
    }
  }

  static reset(): void {
    ResizeObserverMock.instances = []
  }
}

const originalResizeObserver = globalThis.ResizeObserver
const mountedWrappers: Array<{ unmount: () => void }> = []

function trackWrapper<T extends { unmount: () => void }>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}

function disposeWrapper(wrapper: { unmount: () => void }): void {
  const index = mountedWrappers.indexOf(wrapper)
  if (index >= 0) {
    mountedWrappers.splice(index, 1)
  }
  wrapper.unmount()
}

function setElementMetrics(element: HTMLElement, options: MetricOptions): void {
  for (const [key, value] of Object.entries(options)) {
    Object.defineProperty(element, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
}

function createItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    label: `Item ${index}`,
  }))
}

interface RowSlotProps {
  item: unknown
  index: number
  active: boolean
}

function getScrollPositionPayloads(
  wrapper: ReturnType<typeof mount>,
): ScrollPositionPayload[] {
  return (wrapper.emitted('scrollPosition') ?? []).map(
    (event: unknown[]) => event[0] as ScrollPositionPayload,
  )
}

function getLastScrollPositionPayload(
  wrapper: ReturnType<typeof mount>,
): ScrollPositionPayload | undefined {
  const payloads = getScrollPositionPayloads(wrapper)
  return payloads[payloads.length - 1]
}

function getScrollBoundaryPayloads(
  wrapper: ReturnType<typeof mount>,
  eventName: 'scrollTop' | 'scrollEnd',
): ScrollBoundaryPayload[] {
  return (wrapper.emitted(eventName) ?? []).map(
    (event: unknown[]) => event[0] as ScrollBoundaryPayload,
  )
}

function getLastScrollBoundaryPayload(
  wrapper: ReturnType<typeof mount>,
  eventName: 'scrollTop' | 'scrollEnd',
): ScrollBoundaryPayload | undefined {
  const payloads = getScrollBoundaryPayloads(wrapper, eventName)
  return payloads[payloads.length - 1]
}

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        resolve()
      })
      return
    }

    setTimeout(resolve, 0)
  })
  await nextTick()
}

async function settleScroller(): Promise<void> {
  await nextTick()
  await nextTick()
  await flushAnimationFrame()
}

async function syncScroller(
  wrapper: ReturnType<typeof mount>,
  metrics: MetricOptions,
  beforeMetrics?: MetricOptions,
) {
  await settleScroller()

  const element = wrapper.get('.vue-recycle-scroller').element as HTMLElement
  setElementMetrics(element, metrics)

  const beforeWrapper = wrapper.find('.vue-recycle-scroller__slot')
  if (beforeMetrics && beforeWrapper.exists()) {
    const before = beforeWrapper.element as HTMLElement
    setElementMetrics(before, beforeMetrics)
  }

  const vm = wrapper.vm as unknown as RecycleScrollerExpose
  vm.updateVisibleItems()
  await nextTick()

  return { element, vm }
}

function dispatchTouchEvent(
  element: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  clientY: number,
): void {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  })
  const touches = type === 'touchend' || type === 'touchcancel'
    ? []
    : [{ clientY }]

  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: touches,
  })
  Object.defineProperty(event, 'changedTouches', {
    configurable: true,
    value: [{ clientY }],
  })

  element.dispatchEvent(event)
}

describe('RecycleScroller', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
    ResizeObserverMock.reset()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    }
    else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    }
  })

  it('renders slot content and limits DOM nodes to the visible range', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(100),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item, index, active }: RowSlotProps) =>
          h(
            'div',
            { class: 'row', 'data-active': String(active) },
            `${(item as { label: string }).label}|${index}`,
          ),
        before: () => h('div', { class: 'before-slot' }, 'before'),
        after: () => h('div', { class: 'after-slot' }, 'after'),
      },
    }))

    await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 }, { offsetHeight: 0 })

    expect(wrapper.find('.before-slot').exists()).toBe(true)
    expect(wrapper.find('.after-slot').exists()).toBe(true)
    expect(wrapper.findAll('.row')).toHaveLength(3)
    expect(wrapper.findAll('.row').map((item) => item.text())).toEqual([
      'Item 0|0',
      'Item 1|1',
      'Item 2|2',
    ])
  })

  it('updates visible items when the container scrolls', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(100),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    element.scrollTop = 60
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(wrapper.findAll('.row').map((item) => item.text())).toEqual([
      'Item 2|2',
      'Item 3|3',
      'Item 4|4',
    ])
  })

  it('emits scrollPosition when visible boundaries change and keeps native scroll listeners', async () => {
    const items = createItems(20)
    const onScroll = vi.fn()
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items,
        itemSize: 30,
        buffer: 0,
      },
      attrs: {
        onScroll,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element } = await syncScroller(wrapper, { clientHeight: 89, scrollTop: 0 })
    const initialPayloads = getScrollPositionPayloads(wrapper)

    expect(getLastScrollPositionPayload(wrapper)).toEqual({
      first: { index: 0, item: items[0] },
      last: { index: 2, item: items[2] },
    })

    element.scrollTop = 1
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(getScrollPositionPayloads(wrapper)).toHaveLength(initialPayloads.length)

    element.scrollTop = 2
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    const nextPayloads = getScrollPositionPayloads(wrapper)
    expect(onScroll).toHaveBeenCalledTimes(2)
    expect(nextPayloads).toHaveLength(initialPayloads.length + 1)
    expect(getLastScrollPositionPayload(wrapper)).toEqual({
      first: { index: 0, item: items[0] },
      last: { index: 3, item: items[3] },
    })
  })

  it('emits an empty scrollPosition payload when there are no visible items', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: [],
        itemSize: 30,
        buffer: 0,
      },
    }))

    await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    expect(getLastScrollPositionPayload(wrapper)).toEqual({
      first: null,
      last: null,
    })
  })

  it('emits scrollTop and scrollEnd when vertical boundary states change', async () => {
    const items = createItems(6)
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items,
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element, vm } = await syncScroller(wrapper, {
      clientHeight: 90,
      scrollHeight: 180,
      scrollTop: 0,
    })
    const initialTopPayloads = getScrollBoundaryPayloads(wrapper, 'scrollTop')
    const initialEndPayloads = getScrollBoundaryPayloads(wrapper, 'scrollEnd')

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: true,
      scroll: { start: 0, end: 90 },
    })
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: false,
      scroll: { start: 0, end: 90 },
    })

    element.scrollTop = 1
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length)
    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads.length)

    element.scrollTop = 2
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: false,
      scroll: { start: 2, end: 92 },
    })

    element.scrollTop = 89
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads.length + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 89, end: 179 },
    })

    element.scrollTop = 87
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads.length + 2)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: false,
      scroll: { start: 87, end: 177 },
    })

    vm.scrollToPosition(0)
    await settleScroller()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length + 2)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: true,
      scroll: { start: 0, end: 90 },
    })
  })

  it('treats the after slot as outside the scrollEnd content boundary', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(6),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
        after: () => h('div', { class: 'after-slot' }, 'after'),
      },
    }))

    const { element } = await syncScroller(wrapper, {
      clientHeight: 90,
      scrollHeight: 300,
      scrollTop: 0,
    })

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: false,
      scroll: { start: 0, end: 90 },
    })

    element.scrollTop = 89
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 89, end: 179 },
    })
  })

  it('refreshes the render window after small boundary-crossing scroll deltas', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(100),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    expect(wrapper.findAll('.row').map((item) => item.text())).toEqual([
      'Item 0|0',
      'Item 1|1',
      'Item 2|2',
    ])

    element.scrollTop = 1
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(wrapper.findAll('.row').map((item) => item.text())).toEqual([
      'Item 0|0',
      'Item 1|1',
      'Item 2|2',
      'Item 3|3',
    ])
  })

  it('supports horizontal mode and imperative scrolling APIs', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(5),
        itemSize: 40,
        buffer: 0,
        direction: 'horizontal',
      },
      slots: {
        default: ({ item }: RowSlotProps) =>
          h('div', { class: 'cell' }, (item as { label: string }).label),
      },
    }))

    const { element, vm } = await syncScroller(wrapper, { clientWidth: 120, scrollLeft: 0 })

    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain(
      'width: 200px',
    )

    const itemViews = wrapper.findAll('.vue-recycle-scroller__item-view')
    expect(itemViews).toHaveLength(3)
    expect(itemViews[1].attributes('style')).toContain('translateX(40px)')

    vm.scrollToItem(20)
    expect(element.scrollLeft).toBe(160)
    expect(vm.getScroll()).toEqual({ start: 160, end: 280 })

    vm.scrollToPosition(40)
    expect(element.scrollLeft).toBe(40)
    await settleScroller()

    expect(wrapper.emitted('scrollTop')).toBeUndefined()
    expect(wrapper.emitted('scrollEnd')).toBeUndefined()
  })

  it('waits for vertical measurement refresh before emitting boundary events after direction changes', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(6),
        itemSize: 30,
        buffer: 0,
        direction: 'horizontal',
      },
      slots: {
        default: ({ item }: RowSlotProps) =>
          h('div', { class: 'cell' }, (item as { label: string }).label),
      },
    }))

    await syncScroller(wrapper, {
      clientHeight: 90,
      clientWidth: 120,
      scrollHeight: 180,
      scrollLeft: 40,
      scrollTop: 90,
      scrollWidth: 180,
    })

    expect(wrapper.emitted('scrollTop')).toBeUndefined()
    expect(wrapper.emitted('scrollEnd')).toBeUndefined()

    await wrapper.setProps({ direction: 'vertical' })
    await settleScroller()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toEqual([
      {
        reached: false,
        scroll: { start: 90, end: 180 },
      },
    ])
    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toEqual([
      {
        reached: true,
        scroll: { start: 90, end: 180 },
      },
    ])
  })

  it('includes before slot size in scrollToItem and updates on resize', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(10),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        before: () => h('div', { class: 'before-slot' }, 'before'),
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element, vm } = await syncScroller(
      wrapper,
      { clientHeight: 90, scrollTop: 0 },
      { offsetHeight: 60 },
    )

    expect(wrapper.findAll('.row')).toHaveLength(1)

    vm.scrollToItem(2)
    expect(element.scrollTop).toBe(120)

    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 0 })
    setElementMetrics(element, { clientHeight: 120 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(wrapper.findAll('.row')).toHaveLength(4)
  })

  it('arms pull-to-refresh after crossing the threshold and ignores re-entry while refreshing', async () => {
    let resolveRefresh: (() => void) | null = null
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }))

    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(20),
        itemSize: 30,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element, vm } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 88)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 88 })
    vm.updateVisibleItems()
    await nextTick()

    expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('armed')
    expect(wrapper.find('.vue-recycle-scroller__refresh-spinner').exists()).toBe(true)

    dispatchTouchEvent(element, 'touchend', 88)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 56 })
    vm.updateVisibleItems()
    await nextTick()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('refreshing')

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 120)
    dispatchTouchEvent(element, 'touchend', 120)

    expect(onRefresh).toHaveBeenCalledTimes(1)

    ;(resolveRefresh as (() => void) | null)?.()
  })

  it('renders a custom refresh slot with the current pull state', async () => {
    const onRefresh = vi.fn()
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(20),
        itemSize: 30,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
        refresh: ({ state, inset, label }: RecycleScrollerRefreshSlotProps) =>
          h(
            'div',
            {
              class: 'custom-refresh',
              'data-inset': String(inset),
              'data-state': state,
            },
            label,
          ),
      },
    }))

    const { element, vm } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 88)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 88 })
    vm.updateVisibleItems()
    await nextTick()

    expect(wrapper.get('.custom-refresh').attributes('data-state')).toBe('armed')
    expect(wrapper.get('.custom-refresh').attributes('data-inset')).toBe('88')
    expect(wrapper.get('.custom-refresh').text()).toBe('松开立即刷新')
    expect(wrapper.find('.vue-recycle-scroller__refresh-spinner').exists()).toBe(false)
  })

  it('releases pull-to-refresh early without triggering refresh and includes the hold inset in scrollToItem', async () => {
    let resolveRefresh: (() => void) | null = null
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }))

    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(10),
        itemSize: 30,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        before: () => h('div', { class: 'before-slot' }, 'before'),
        default: ({ item, index }: RowSlotProps) =>
          h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
      },
    }))

    const { element, vm } = await syncScroller(
      wrapper,
      { clientHeight: 90, scrollTop: 0 },
      { offsetHeight: 60 },
    )

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 40)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 100 })
    vm.updateVisibleItems()
    await nextTick()

    dispatchTouchEvent(element, 'touchend', 40)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 60 })
    vm.updateVisibleItems()
    await nextTick()

    expect(onRefresh).not.toHaveBeenCalled()

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 90)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 150 })
    vm.updateVisibleItems()
    await nextTick()

    dispatchTouchEvent(element, 'touchend', 90)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 116 })
    vm.updateVisibleItems()
    await nextTick()

    const slotElement = wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement
    expect(Array.from(slotElement.children).map((child) => child.className)).toContain('before-slot')
    expect(Array.from(slotElement.children)[0]?.className).toContain('before-slot')
    expect(Array.from(slotElement.children)[1]?.className).toContain('vue-recycle-scroller__refresh')

    vm.scrollToItem(2)
    expect(element.scrollTop).toBe(176)

    ;(resolveRefresh as (() => void) | null)?.()
  })

  it('settles refresh failures without leaking unhandled promise rejections', async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error('refresh failed')))
    const unhandledRejection = vi.fn()
    const handleUnhandledRejection = (reason: unknown) => {
      unhandledRejection(reason)
    }

    process.on('unhandledRejection', handleUnhandledRejection)

    try {
      const wrapper = trackWrapper(mount(RecycleScroller, {
        props: {
          items: createItems(10),
          itemSize: 30,
          buffer: 0,
          pullToRefresh: true,
          onRefresh,
        },
        slots: {
          default: ({ item, index }: RowSlotProps) =>
            h('div', { class: 'row' }, `${(item as { label: string }).label}|${index}`),
        },
      }))

      const { element, vm } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

      dispatchTouchEvent(element, 'touchstart', 0)
      dispatchTouchEvent(element, 'touchmove', 88)
      setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 88 })
      vm.updateVisibleItems()
      await nextTick()

      dispatchTouchEvent(element, 'touchend', 88)
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 220))
      await nextTick()

      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('idle')
      expect(unhandledRejection).not.toHaveBeenCalled()
    }
    finally {
      process.off('unhandledRejection', handleUnhandledRejection)
    }
  })

  it('renders primitive items when itemKey is a function', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: ['a', 'b', 'c', 'd'],
        itemSize: 30,
        buffer: 0,
        itemKey: (item: unknown) => item as string,
      },
      slots: {
        default: ({ item }: RowSlotProps) => h('div', { class: 'row' }, String(item)),
      },
    }))

    await syncScroller(wrapper, { clientHeight: 60, scrollTop: 0 })

    expect(wrapper.findAll('.row').map((item) => item.text())).toEqual(['a', 'b'])
  })

  it('renders the empty slot when there are no items', async () => {
    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: [],
        itemSize: 30,
      },
      slots: {
        empty: () => h('div', { class: 'empty-slot' }, 'empty'),
      },
    }))

    await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    expect(wrapper.find('.empty-slot').exists()).toBe(true)
  })

  it('rejects duplicate keys and oversized windows', async () => {
    const duplicateWrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: [{ id: 'same' }, { id: 'same' }],
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ index }: RowSlotProps) => h('div', { class: 'row' }, String(index)),
      },
    }))

    await settleScroller()

    const duplicateElement = duplicateWrapper.get('.vue-recycle-scroller').element as HTMLElement
    setElementMetrics(duplicateElement, { clientHeight: 60, scrollTop: 0 })

    expect(() => {
      (duplicateWrapper.vm as unknown as RecycleScrollerExpose).updateVisibleItems()
    }).toThrow('duplicate key')
    disposeWrapper(duplicateWrapper)

    const limitWrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(1501),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ index }: RowSlotProps) => h('div', { class: 'row' }, String(index)),
      },
    }))

    await settleScroller()

    const limitElement = limitWrapper.get('.vue-recycle-scroller').element as HTMLElement
    setElementMetrics(limitElement, { clientHeight: 30060, scrollTop: 0 })

    expect(() => {
      (limitWrapper.vm as unknown as RecycleScrollerExpose).updateVisibleItems()
    }).toThrow('tried to render')
    disposeWrapper(limitWrapper)
  })

  it('remounts stateful slot content by logical item key during view reuse', async () => {
    const StatefulRow = defineComponent({
      name: 'StatefulRow',
      props: {
        label: {
          type: String,
          required: true,
        },
      },
      setup(props) {
        const mountedFor = ref(props.label)

        return () => h('div', { class: 'stateful-row', 'data-mounted-for': mountedFor.value }, props.label)
      },
    })

    const wrapper = trackWrapper(mount(RecycleScroller, {
      props: {
        items: createItems(10),
        itemSize: 30,
        buffer: 0,
      },
      slots: {
        default: ({ item }: RowSlotProps) =>
          h(StatefulRow, { label: (item as { label: string }).label }),
      },
    }))

    const { element } = await syncScroller(wrapper, { clientHeight: 90, scrollTop: 0 })

    element.scrollTop = 30
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    for (const row of wrapper.findAll('.stateful-row')) {
      expect(row.attributes('data-mounted-for')).toBe(row.text())
    }
  })

  it('throws when itemSize is missing or invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() =>
      trackWrapper(mount(RecycleScroller, {
        props: {
          items: createItems(2),
          itemSize: 0,
        },
      })),
    ).toThrow('RecycleScroller requires a positive itemSize')

    warnSpy.mockRestore()
  })

  it('throws when pullToRefresh is enabled without onRefresh or in horizontal direction', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() =>
      trackWrapper(mount(RecycleScroller, {
        props: {
          items: createItems(2),
          itemSize: 30,
          pullToRefresh: true,
        },
      })),
    ).toThrow('requires onRefresh when pullToRefresh is enabled')

    expect(() =>
      trackWrapper(mount(RecycleScroller, {
        props: {
          items: createItems(2),
          itemSize: 30,
          direction: 'horizontal',
          pullToRefresh: true,
          onRefresh: () => undefined,
        },
      })),
    ).toThrow('pullToRefresh currently supports only vertical direction')

    warnSpy.mockRestore()
  })
})
