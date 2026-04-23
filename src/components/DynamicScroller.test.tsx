import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import type {
  DynamicScrollerDefaultSlotProps,
  DynamicScrollerExpose,
  DynamicScrollerRefreshSlotProps,
  ScrollBoundaryPayload,
  ScrollPositionPayload,
} from '../types/recycle-scroller'
import DynamicScroller from './dynamic-scroller'
import DynamicScrollerItem from './dynamic-scroller-item'

interface MetricOptions {
  clientHeight?: number
  offsetHeight?: number
  scrollHeight?: number
  scrollTop?: number
}

interface Story {
  id: string
  lines: string[]
}

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []

  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  observe = vi.fn()
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

function setElementMetrics(element: HTMLElement, options: MetricOptions): void {
  for (const [key, value] of Object.entries(options)) {
    Object.defineProperty(element, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
}

function createStories(count: number): Story[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `story-${index}`,
    lines: Array.from({ length: (index % 3) + 1 }, (_, lineIndex) =>
      `Line ${lineIndex + 1} for story ${index}.`,
    ),
  }))
}

function renderDynamicSlot({ item, index, active }: DynamicScrollerDefaultSlotProps) {
  const story = item as Story

  return h(
    DynamicScrollerItem,
    {
      item,
      index,
      active,
      sizeDependencies: story.lines,
    },
    {
      default: () =>
        h('div', { class: 'story' }, [
          h('strong', story.id),
          ...story.lines.map((line) => h('p', line)),
        ]),
    },
  )
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

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
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

async function syncDynamicScroller(
  wrapper: ReturnType<typeof mount>,
  metrics: MetricOptions,
) {
  await settleScroller()
  const element = wrapper.get('.vue-dynamic-scroller').element as HTMLElement
  setElementMetrics(element, metrics)
  const componentVm = wrapper.vm as unknown as DynamicScrollerExpose & {
    $?: { exposed?: DynamicScrollerExpose }
  }
  const vm = typeof componentVm.updateVisibleItems === 'function'
    ? componentVm
    : componentVm.$?.exposed as DynamicScrollerExpose
  vm.updateVisibleItems()
  await nextTick()
  return { element, vm }
}

describe('DynamicScroller', () => {
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

  it('renders the estimated range and scrolls by estimated offsets', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(20),
        minItemSize: 60,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 0,
    })

    expect(wrapper.findAll('.story')).toHaveLength(2)

    vm.scrollToItem(5)
    expect(element.scrollTop).toBe(300)
  })

  it('renders the empty slot outside the zero-height item wrapper', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: [],
        minItemSize: 60,
      },
      slots: {
        empty: () => h('div', { class: 'empty-slot' }, 'empty'),
      },
    }))

    await syncDynamicScroller(wrapper, { clientHeight: 120, scrollTop: 0 })

    const itemWrapper = wrapper.get('.vue-recycle-scroller__item-wrapper')
    const emptySlot = wrapper.get('.empty-slot')
    expect(itemWrapper.attributes('style')).toContain('height: 0px;')
    expect(itemWrapper.element.contains(emptySlot.element)).toBe(false)
    expect(wrapper.find('.empty-slot').exists()).toBe(true)
  })

  it('refreshes the estimated window after small boundary-crossing scroll deltas', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(20),
        minItemSize: 60,
        buffer: 0,
      },
      slots: {
        default: ({ item, index }: DynamicScrollerDefaultSlotProps) =>
          h('div', { class: 'story' }, `${(item as Story).id}|${index}`),
      },
    }))

    const { element } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 0,
    })

    expect(wrapper.findAll('.story')).toHaveLength(2)

    element.scrollTop = 1
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(wrapper.findAll('.story')).toHaveLength(3)
    expect(wrapper.findAll('.story').map((item) => item.text())).toEqual([
      'story-0|0',
      'story-1|1',
      'story-2|2',
    ])
  })

  it('emits scrollPosition for estimated windows and measurement-driven boundary changes', async () => {
    const items = createStories(4)
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items,
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollTop: 0,
    })

    const initialPayloads = getScrollPositionPayloads(wrapper)
    expect(getLastScrollPositionPayload(wrapper)).toEqual({
      first: { index: 0, item: items[0] },
      last: { index: 1, item: items[1] },
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 140 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    const nextPayloads = getScrollPositionPayloads(wrapper)
    expect(nextPayloads).toHaveLength(initialPayloads.length + 1)
    expect(getLastScrollPositionPayload(wrapper)).toEqual({
      first: { index: 0, item: items[0] },
      last: { index: 0, item: items[0] },
    })
  })

  it('emits scrollTop and scrollEnd when dynamic boundary states change and keeps native scroll listeners', async () => {
    const onScroll = vi.fn()
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(4),
        minItemSize: 50,
        buffer: 0,
      },
      attrs: {
        onScroll,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollHeight: 200,
      scrollTop: 0,
    })
    const initialTopPayloads = getScrollBoundaryPayloads(wrapper, 'scrollTop')
    const initialEndPayloads = getScrollBoundaryPayloads(wrapper, 'scrollEnd')

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: true,
      scroll: { start: 0, end: 100 },
    })
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: false,
      scroll: { start: 0, end: 100 },
    })

    element.scrollTop = 1
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length)

    element.scrollTop = 2
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(onScroll).toHaveBeenCalledTimes(2)
    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: false,
      scroll: { start: 2, end: 102 },
    })

    element.scrollTop = 99
    await wrapper.trigger('scroll')
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads.length + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 99, end: 199 },
    })

    vm.scrollToPosition(0)
    await settleScroller()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollTop')).toHaveLength(initialTopPayloads.length + 2)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollTop')).toEqual({
      reached: true,
      scroll: { start: 0, end: 100 },
    })
  })

  it('emits scrollEnd state changes when dynamic measurement convergence changes the bottom boundary', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(2),
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element } = await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollHeight: 100,
      scrollTop: 0,
    })
    const initialEndPayloads = getScrollBoundaryPayloads(wrapper, 'scrollEnd')

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 0, end: 100 },
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(element, { scrollHeight: 190 })
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 140 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads.length + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: false,
      scroll: { start: 0, end: 100 },
    })
  })

  it('treats the after slot as outside the dynamic scrollEnd content boundary', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(2),
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
        after: () => <div class="after-slot">after</div>,
      },
    }))

    await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollHeight: 220,
      scrollTop: 0,
    })

    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 0, end: 100 },
    })
  })

  it('normalizes duplicate keys, warns once, and keeps duplicate measurements isolated', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const stories: Story[] = [
      { id: 'same', lines: ['first'] },
      { id: 'same', lines: ['second'] },
      { id: 'same_1', lines: ['third'] },
    ]
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: stories,
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: ({ item, index, active }: DynamicScrollerDefaultSlotProps) =>
          h(DynamicScrollerItem, {
            item,
            index,
            active,
            sizeDependencies: (item as Story).lines,
          }, {
            default: () => h('div', { class: 'story' }, `${(item as Story).id}|${index}`),
          }),
      },
    }))

    const { element } = await syncDynamicScroller(wrapper, {
      clientHeight: 200,
      scrollHeight: 150,
      scrollTop: 0,
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(element, { scrollHeight: 270 })
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[1].element as HTMLElement, { offsetHeight: 140 })
    setElementMetrics(itemElements[2].element as HTMLElement, { offsetHeight: 50 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(wrapper.findAll('.story').map((item) => item.text())).toEqual([
      'same|0',
      'same|1',
    ])
    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 270px;')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('DynamicScroller detected duplicate itemKey values')
  })

  it('suppresses derived events when a dynamic commit fails and resumes after recovery', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(4),
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollHeight: 200,
      scrollTop: 0,
    })
    const initialPositionPayloads = getScrollPositionPayloads(wrapper).length
    const initialEndPayloads = getScrollBoundaryPayloads(wrapper, 'scrollEnd').length

    element.scrollTop = 100
    await wrapper.setProps({ minItemSize: 0 })

    expect(() => {
      vm.updateVisibleItems()
    }).toThrow('positive minItemSize')
    expect(getScrollPositionPayloads(wrapper)).toHaveLength(initialPositionPayloads)
    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads)

    await wrapper.setProps({ minItemSize: 50 })
    vm.updateVisibleItems()
    await nextTick()

    expect(getScrollPositionPayloads(wrapper)).toHaveLength(initialPositionPayloads + 1)
    expect(getScrollBoundaryPayloads(wrapper, 'scrollEnd')).toHaveLength(initialEndPayloads + 1)
    expect(getLastScrollBoundaryPayload(wrapper, 'scrollEnd')).toEqual({
      reached: true,
      scroll: { start: 100, end: 200 },
    })
  })

  it('rebuilds layout state after in-place logical reordering', async () => {
    const items = ref(createStories(3))

    const Host = defineComponent({
      setup() {
        return () => h('div', [
          h(
            'button',
            {
              class: 'reverse',
              onClick: () => {
                items.value.reverse()
              },
            },
            'reverse',
          ),
          h(DynamicScroller, {
            items: items.value,
            minItemSize: 50,
            buffer: 0,
          }, {
            default: renderDynamicSlot,
          }),
        ])
      },
    })

    const wrapper = trackWrapper(mount(Host))
    const scrollerWrapper = wrapper.getComponent(DynamicScroller)
    const { element, vm } = await syncDynamicScroller(scrollerWrapper, {
      clientHeight: 150,
      scrollTop: 0,
    })

    const itemElements = scrollerWrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[1].element as HTMLElement, { offsetHeight: 50 })
    setElementMetrics(itemElements[2].element as HTMLElement, { offsetHeight: 50 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(wrapper.findAll('.story').map((item) => item.text())).toEqual([
      'story-0Line 1 for story 0.',
      'story-1Line 1 for story 1.Line 2 for story 1.',
      'story-2Line 1 for story 2.Line 2 for story 2.Line 3 for story 2.',
    ])

    await wrapper.get('.reverse').trigger('click')
    await settleScroller()

    vm.scrollToItem(2)
    expect(element.scrollTop).toBe(100)
  })

  it('refreshes visible entries when a queued resize coincides with reordering', async () => {
    const items = ref(createStories(4))

    const Host = defineComponent({
      setup() {
        return () =>
          h(DynamicScroller, {
            items: items.value,
            minItemSize: 50,
            buffer: 0,
          }, {
            default: ({ item, index, active }: DynamicScrollerDefaultSlotProps) =>
              h(
                DynamicScrollerItem,
                {
                  item,
                  index,
                  active,
                  sizeDependencies: (item as Story).lines,
                },
                {
                  default: () => h('div', { class: 'story' }, (item as Story).id),
                },
              ),
          })
      },
    })

    const wrapper = trackWrapper(mount(Host))
    const scrollerWrapper = wrapper.getComponent(DynamicScroller)

    await syncDynamicScroller(scrollerWrapper, {
      clientHeight: 200,
      scrollTop: 0,
    })

    const itemElements = scrollerWrapper.findAll('.vue-dynamic-scroller-item')
    for (const itemElement of itemElements) {
      setElementMetrics(itemElement.element as HTMLElement, { offsetHeight: 50 })
    }
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[1].element as HTMLElement, { offsetHeight: 20 })
    ResizeObserverMock.triggerAll()
    items.value = [...items.value].reverse()
    await nextTick()
    await flushAnimationFrame()

    expect(scrollerWrapper.findAll('.story').map((item) => item.text())).toEqual([
      'story-3',
      'story-2',
      'story-1',
      'story-0',
    ])
  })

  it('updates total size after item measurements arrive', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(4),
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollTop: 0,
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[1].element as HTMLElement, { offsetHeight: 70 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 250px')
  })

  it('keeps the first measurement after an in-place key change', async () => {
    const items = ref<Story[]>([{ id: 'story-a', lines: ['Line 1'] }])

    const Host = defineComponent({
      setup() {
        return () =>
          h(DynamicScroller, {
            items: items.value,
            minItemSize: 50,
            buffer: 0,
          }, {
            default: renderDynamicSlot,
          })
      },
    })

    const wrapper = trackWrapper(mount(Host))
    const scrollerWrapper = wrapper.getComponent(DynamicScroller)

    await syncDynamicScroller(scrollerWrapper, {
      clientHeight: 200,
      scrollTop: 0,
    })

    const itemElement = scrollerWrapper.get('.vue-dynamic-scroller-item').element as HTMLElement
    setElementMetrics(itemElement, { offsetHeight: 50 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    items.value[0].id = 'story-b'
    items.value[0].lines.push('Line 2')
    setElementMetrics(itemElement, { offsetHeight: 80 })
    await nextTick()
    await flushAnimationFrame()

    expect(scrollerWrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 80px')
  })

  it('keeps the visual anchor stable when an item above the viewport grows', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(20),
        minItemSize: 40,
        buffer: 200,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 120,
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    for (const itemElement of itemElements) {
      setElementMetrics(itemElement.element as HTMLElement, { offsetHeight: 40 })
    }
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 100 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(element.scrollTop).toBe(180)
  })

  it('updates rendered positions when measurements shift offsets without changing total size', async () => {
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(4),
        minItemSize: 50,
        buffer: 0,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    await syncDynamicScroller(wrapper, {
      clientHeight: 200,
      scrollTop: 0,
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    for (const itemElement of itemElements) {
      setElementMetrics(itemElement.element as HTMLElement, { offsetHeight: 50 })
    }
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    let itemViews = wrapper.findAll('.vue-recycle-scroller__item-view')
    expect(itemViews[1].attributes('style')).toContain('translateY(50px)')
    expect(itemViews[2].attributes('style')).toContain('translateY(100px)')

    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[2].element as HTMLElement, { offsetHeight: 20 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    itemViews = wrapper.findAll('.vue-recycle-scroller__item-view')
    expect(itemViews[1].attributes('style')).toContain('translateY(80px)')
    expect(itemViews[2].attributes('style')).toContain('translateY(130px)')
    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 200px')
  })

  it('reconciles an estimated scrollToItem target after preceding measurements arrive', async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      id: `row-${index}`,
      label: `Row ${index}`,
    }))

    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items,
        minItemSize: 40,
        buffer: 120,
      },
      slots: {
        default: ({ item, index, active }: DynamicScrollerDefaultSlotProps) =>
          h(
            DynamicScrollerItem,
            {
              item,
              index,
              active,
              sizeDependencies: [(item as { label: string }).label],
            },
            {
              default: () => h('div', { class: 'story', 'data-row-id': (item as { id: string }).id }, (item as { label: string }).label),
            },
          ),
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 0,
    })

    vm.scrollToItem(6)
    expect(element.scrollTop).toBe(240)
    await settleScroller()

    for (const itemElement of wrapper.findAll('.vue-dynamic-scroller-item')) {
      setElementMetrics(
        itemElement.element as HTMLElement,
        { offsetHeight: /Row [345]/.test(itemElement.text()) ? 120 : 40 },
      )
    }

    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()
    await flushAnimationFrame()

    expect(element.scrollTop).toBe(480)
  })

  it('releases pull-to-refresh early without triggering refresh', async () => {
    const onRefresh = vi.fn()
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(8),
        minItemSize: 60,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 0,
    })

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 48)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 48 })
    vm.updateVisibleItems()
    await nextTick()

    expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('pulling')

    dispatchTouchEvent(element, 'touchend', 48)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 0 })
    vm.updateVisibleItems()
    await nextTick()

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('renders a custom refresh slot with the current pull state', async () => {
    const onRefresh = vi.fn()
    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(8),
        minItemSize: 60,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        default: renderDynamicSlot,
        refresh: ({ state, inset, label }: DynamicScrollerRefreshSlotProps) =>
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

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 120,
      scrollTop: 0,
    })

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 96)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 96 })
    vm.updateVisibleItems()
    await nextTick()

    expect(wrapper.get('.custom-refresh').attributes('data-state')).toBe('armed')
    expect(wrapper.get('.custom-refresh').attributes('data-inset')).toBe('96')
    expect(wrapper.get('.custom-refresh').text()).toBe('松开立即刷新')
    expect(wrapper.find('.vue-recycle-scroller__refresh-spinner').exists()).toBe(false)
  })

  it('keeps cached measurements while pull-to-refresh is active and ignores repeated pulls', async () => {
    let resolveRefresh: (() => void) | null = null
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }))

    const wrapper = trackWrapper(mount(DynamicScroller, {
      props: {
        items: createStories(4),
        minItemSize: 50,
        buffer: 0,
        pullToRefresh: true,
        onRefresh,
      },
      slots: {
        default: renderDynamicSlot,
      },
    }))

    const { element, vm } = await syncDynamicScroller(wrapper, {
      clientHeight: 100,
      scrollTop: 0,
    })

    const itemElements = wrapper.findAll('.vue-dynamic-scroller-item')
    setElementMetrics(itemElements[0].element as HTMLElement, { offsetHeight: 80 })
    setElementMetrics(itemElements[1].element as HTMLElement, { offsetHeight: 70 })
    ResizeObserverMock.triggerAll()
    await flushAnimationFrame()

    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 250px')

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 96)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 96 })
    vm.updateVisibleItems()
    await nextTick()

    expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('armed')

    dispatchTouchEvent(element, 'touchend', 96)
    setElementMetrics(wrapper.get('.vue-recycle-scroller__slot').element as HTMLElement, { offsetHeight: 56 })
    vm.updateVisibleItems()
    await nextTick()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.vue-recycle-scroller__refresh').attributes('data-state')).toBe('refreshing')
    expect(wrapper.get('.vue-recycle-scroller__item-wrapper').attributes('style')).toContain('height: 250px')

    vm.scrollToItem(2)
    expect(element.scrollTop).toBe(206)

    dispatchTouchEvent(element, 'touchstart', 0)
    dispatchTouchEvent(element, 'touchmove', 140)
    dispatchTouchEvent(element, 'touchend', 140)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    ;(resolveRefresh as (() => void) | null)?.()
  })

  it('throws when direction is not vertical', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() =>
      trackWrapper(mount(DynamicScroller, {
        props: {
          items: createStories(2),
          minItemSize: 40,
          pullToRefresh: true,
        },
      })),
    ).toThrow('requires onRefresh when pullToRefresh is enabled')

    expect(() =>
      trackWrapper(mount(DynamicScroller, {
        props: {
          items: createStories(2),
          minItemSize: 40,
          direction: 'horizontal' as unknown as 'vertical',
        },
      })),
    ).toThrow('DynamicScroller currently supports only vertical direction')

    warnSpy.mockRestore()
  })
})
