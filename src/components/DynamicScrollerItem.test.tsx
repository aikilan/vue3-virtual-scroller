import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, provide, ref } from 'vue'

import { dynamicScrollerContextKey } from '../composables/dynamic-scroller/context'
import DynamicScrollerItem from './dynamic-scroller-item'

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

function setElementMetrics(element: HTMLElement, offsetHeight: number): void {
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    writable: true,
    value: offsetHeight,
  })
}

describe('DynamicScrollerItem', () => {
  afterEach(() => {
    ResizeObserverMock.reset()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    }
    else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    }
  })

  it('reports size on mount and after sizeDependencies change', async () => {
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
    const reportItemSize = vi.fn()
    const version = ref(0)

    const Host = defineComponent({
      setup() {
        provide(dynamicScrollerContextKey, {
          reportItemSize,
          resolveItemKey: () => 'row-0',
        })

        return () =>
          h('div', [
            h(
              'button',
              {
                class: 'toggle',
                onClick: () => {
                  version.value += 1
                },
              },
              'toggle',
            ),
            h(
              DynamicScrollerItem,
              {
                item: { id: 'row-0' },
                index: 0,
                active: true,
                sizeDependencies: [version.value],
              },
              {
                default: () => h('div', { class: 'content' }, `version-${version.value}`),
              },
            ),
          ])
      },
    })

    const wrapper = mount(Host)
    const itemElement = wrapper.get('.vue-dynamic-scroller-item').element as HTMLElement
    setElementMetrics(itemElement, 72)

    ResizeObserverMock.triggerAll()
    await nextTick()

    expect(reportItemSize).toHaveBeenLastCalledWith({ id: 'row-0' }, 0, 72)

    setElementMetrics(itemElement, 120)
    await wrapper.get('.toggle').trigger('click')
    await nextTick()

    expect(reportItemSize).toHaveBeenLastCalledWith({ id: 'row-0' }, 0, 120)
  })
})
