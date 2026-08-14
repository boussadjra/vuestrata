import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'

import UiPageHeader from '@/components/ui/UiPageHeader.vue'
import DashboardFilterBar from '@/modules/analytics/components/DashboardFilterBar.vue'

describe('UiPageHeader actions slot', () => {
  it('lets actions take the full row on small screens instead of shrink-wrapping', () => {
    const wrapper = mount(UiPageHeader, {
      props: { title: 'Dashboard' },
      slots: { actions: '<button>Filter</button>' },
    })
    const actions = wrapper.find('header > div:last-child')
    expect(actions.classes()).toContain('w-full')
    expect(actions.classes()).toContain('min-w-0')
    expect(actions.classes()).not.toContain('shrink-0')
  })

  it('does not render an empty actions row when the slot is unused', () => {
    const wrapper = mount(UiPageHeader, { props: { title: 'Dashboard' } })
    expect(wrapper.findAll('header > div')).toHaveLength(1)
  })
})

describe('DashboardFilterBar', () => {
  it('stacks range and segment on a narrow column', () => {
    const wrapper = mount(DashboardFilterBar, {
      props: { modelValue: { range: '7d', segment: 'all' } },
      global: {
        stubs: { UiSelect: true, UiToggleGroup: true },
      },
    })

    expect(wrapper.classes()).toContain('flex-col')
    expect(wrapper.classes()).toContain('w-full')
    expect(wrapper.classes()).toContain('min-w-0')
  })
})
