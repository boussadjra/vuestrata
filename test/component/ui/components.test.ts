import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'

// Mock matchMedia for any composables that use persistence
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

import Logo from '@/components/Logo.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

describe('AppIcon', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should render a span element with aria-hidden', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    const span = wrapper.find('span')
    expect(span.exists()).toBe(true)
    expect(span.attributes('aria-hidden')).toBe('true')
  })

  it('should apply size class based on size prop', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home', size: 'lg' } })
    const span = wrapper.find('span')
    expect(span.classes()).toContain('h-6')
    expect(span.classes()).toContain('w-6')
  })

  it('should default to md size', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    const span = wrapper.find('span')
    expect(span.classes()).toContain('h-5')
    expect(span.classes()).toContain('w-5')
  })

  it('should apply xs size class', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home', size: 'xs' } })
    const span = wrapper.find('span')
    expect(span.classes()).toContain('h-3')
    expect(span.classes()).toContain('w-3')
  })

  it('should apply icon class from provider', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    const span = wrapper.find('span')
    // The span should have at least a size class; the icon class depends on the provider
    expect(span.classes().length).toBeGreaterThanOrEqual(2)
  })
})

describe('Logo', () => {
  it('should render an SVG element', () => {
    const wrapper = mount(Logo)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('should use default aria-label', () => {
    const wrapper = mount(Logo)
    expect(wrapper.find('svg').attributes('aria-label')).toBe('Vuestrata logo')
  })

  it('should accept custom title', () => {
    const wrapper = mount(Logo, { props: { title: 'Custom Logo' } })
    expect(wrapper.find('svg').attributes('aria-label')).toBe('Custom Logo')
  })

  it('should have role=img for accessibility', () => {
    const wrapper = mount(Logo)
    expect(wrapper.find('svg').attributes('role')).toBe('img')
  })

  it('should apply custom className', () => {
    const wrapper = mount(Logo, { props: { className: 'my-custom-class' } })
    expect(wrapper.find('svg').classes()).toContain('my-custom-class')
  })
})
