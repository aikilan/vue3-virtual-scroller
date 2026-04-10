import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import App from './App'
import { RecycleScroller } from './index'

async function settleAppUpdates(cycles = 24): Promise<void> {
  for (let index = 0; index < cycles; index++) {
    await nextTick()
  }
}

async function emitScrollEnd(wrapper: ReturnType<typeof mount>): Promise<void> {
  wrapper.getComponent(RecycleScroller).vm.$emit('scrollEnd', {
    reached: true,
    scroll: { start: 0, end: 0 },
  })
  await settleAppUpdates()
}

describe('App', () => {
  it('renders the container-only demo shell', () => {
    const wrapper = mount(App)

    expect(wrapper.get('h1').text()).toBe('虚拟滚动容器演示')
    expect(wrapper.findAll('.demo-nav__item')).toHaveLength(5)
    expect(wrapper.find('.demo-scroller').exists()).toBe(true)
    expect(wrapper.find('.demo-refresh-scroller').exists()).toBe(false)
    expect(wrapper.text()).toContain('scrollToItem()')
  })

  it('switches demos from the top navigation bar', async () => {
    const wrapper = mount(App)

    await wrapper.findAll('.demo-nav__item')[1].trigger('click')
    expect(wrapper.find('.demo-refresh-scroller').exists()).toBe(true)
    expect(wrapper.find('.demo-scroller').exists()).toBe(false)

    await wrapper.findAll('.demo-nav__item')[2].trigger('click')
    expect(wrapper.find('.demo-dynamic-scroller').exists()).toBe(true)
    expect(wrapper.find('.demo-refresh-scroller').exists()).toBe(false)

    await wrapper.findAll('.demo-nav__item')[4].trigger('click')
    expect(wrapper.find('.demo-duplicate-scroller').exists()).toBe(true)
    expect(wrapper.text()).toContain('重复 key 都被内部兼容了')
  })

  it('shows empty feedback when the filter removes all messages', async () => {
    const wrapper = mount(App)

    await wrapper.get('input[type="text"]').setValue('not-found-keyword')

    expect(wrapper.text()).toContain('No messages matched the current filter.')
  })

  it('keeps loading container batches from one scrollEnd until content can scroll', async () => {
    const wrapper = mount(App)
    const numberInputs = wrapper.findAll('input[type="number"]')

    await numberInputs[1].setValue('30000')
    expect(wrapper.get('.demo-footer').text()).toContain('已加载 160/1240 条数据')

    await emitScrollEnd(wrapper)

    expect(wrapper.get('.demo-footer').text()).toContain('已加载 520/1240 条数据')
  })

  it('keeps backfilling filtered container results until no data remains', async () => {
    const wrapper = mount(App)

    await wrapper.get('input[type="text"]').setValue('Message 160')
    expect(wrapper.get('.demo-footer').text()).toContain('已加载 160/1240 条数据')

    await emitScrollEnd(wrapper)

    expect(wrapper.get('.demo-footer').text()).toContain('全部 demo 数据都已经加载完成。')
  })
})
