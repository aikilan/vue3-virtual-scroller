import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the container-only demo shell', () => {
    const wrapper = mount(App)

    expect(wrapper.get('h1').text()).toBe('虚拟滚动容器演示')
    expect(wrapper.findAll('.demo-nav__item')).toHaveLength(3)
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
  })

  it('shows empty feedback when the filter removes all messages', async () => {
    const wrapper = mount(App)

    await wrapper.get('input[type="text"]').setValue('not-found-keyword')

    expect(wrapper.text()).toContain('No messages matched the current filter.')
  })
})
