import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'

import UiPanel from '@/components/ui/UiPanel.vue'
import UiStatCard from '@/components/ui/UiStatCard.vue'

describe('UiPanel / UiStatCard theme hook', () => {
  it('exposes data-ui="card" so theme card chrome applies', () => {
    const panel = mount(UiPanel, { props: { title: 'Revenue' } })
    expect(panel.find('section').attributes('data-ui')).toBe('card')

    const stat = mount(UiStatCard, { props: { label: 'Revenue', value: '$48.5K' } })
    expect(stat.find('section').attributes('data-ui')).toBe('card')
    expect(stat.find('section').attributes('data-shape')).toBe('tabbed')
  })

  it('hides a decorative metric icon from assistive technology', () => {
    const stat = mount(UiStatCard, {
      props: { label: 'Revenue', value: '$48.5K', icon: 'dollar' },
    })

    const icon = stat.find('[aria-hidden="true"]')
    expect(icon.exists()).toBe(true)
    expect(stat.find('section').text()).toContain('Revenue')
    expect(stat.find('section').text()).toContain('$48.5K')
  })

  it('marks the region busy while a refetch is in flight, without blanking it', () => {
    const panel = mount(UiPanel, {
      props: { title: 'Revenue', updating: true },
      slots: { default: 'Ready figures' },
    })

    expect(panel.find('section').attributes('aria-busy')).toBe('true')
    expect(panel.text()).toContain('Ready figures')
  })
})
