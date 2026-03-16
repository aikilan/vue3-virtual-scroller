import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TsxFeature from './TsxFeature'

describe('TsxFeature', () => {
  it('renders the TSX capability label', () => {
    const wrapper = mount(TsxFeature)

    expect(wrapper.get('.tsx-feature__label').text()).toBe('TSX Ready')
  })

  it('renders all supported features', () => {
    const wrapper = mount(TsxFeature)

    expect(wrapper.findAll('.tsx-feature__item').map((item) => item.text())).toEqual([
      'Vite',
      'TypeScript',
      'ESLint',
      'Less',
      'Prettier',
      'TSX',
    ])
  })
})
