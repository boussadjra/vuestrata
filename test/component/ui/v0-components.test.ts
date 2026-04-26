import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

// ---------------------------------------------------------------------------
// Mock helpers — @vuetify/v0 compound components render slots as plain divs
// ---------------------------------------------------------------------------

vi.mock('@vuetify/v0', () => {
  const s = (name: string) =>
    defineComponent({
      name,
      inheritAttrs: true,
      setup(_, { slots, attrs }) {
        return () => h('div', { 'data-stub': name, ...attrs }, slots.default?.())
      },
    })

  return {
    ExpansionPanel: {
      Group: s('ExpansionPanel.Group'),
      Root: s('ExpansionPanel.Root'),
      Activator: s('ExpansionPanel.Activator'),
      Content: s('ExpansionPanel.Content'),
      Cue: s('ExpansionPanel.Cue'),
    },
    Dialog: {
      Root: s('Dialog.Root'),
      Activator: s('Dialog.Activator'),
      Content: s('Dialog.Content'),
      Title: s('Dialog.Title'),
      Description: s('Dialog.Description'),
      Close: s('Dialog.Close'),
    },
    Popover: {
      Root: s('Popover.Root'),
      Activator: s('Popover.Activator'),
      Content: s('Popover.Content'),
    },
    Tabs: {
      Root: s('Tabs.Root'),
      List: s('Tabs.List'),
      Item: s('Tabs.Item'),
      Panel: s('Tabs.Panel'),
    },
    Button: {
      Root: s('Button.Root'),
      Group: s('Button.Group'),
    },
    Avatar: {
      Root: s('Avatar.Root'),
      Image: s('Avatar.Image'),
      Fallback: s('Avatar.Fallback'),
    },
    Breadcrumbs: {
      Root: s('Breadcrumbs.Root'),
      List: s('Breadcrumbs.List'),
      Item: s('Breadcrumbs.Item'),
      Divider: s('Breadcrumbs.Divider'),
      Page: s('Breadcrumbs.Page'),
    },
    Progress: {
      Root: s('Progress.Root'),
      Track: s('Progress.Track'),
      Fill: s('Progress.Fill'),
    },
    Step: {
      Root: s('Step.Root'),
      Item: s('Step.Item'),
    },
  }
})

// Mock icon provider
vi.mock('~/config/icon-provider', () => ({
  resolveIcon: (name: string) => `icon-${name}`,
}))

// Mock notification store
vi.mock('~/stores/notification', () => ({
  useNotificationStore: () => ({
    add: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Imports — after mocks so they receive stubbed dependencies
// ---------------------------------------------------------------------------

import V0Accordion from '@/components/ui/provider/vuetify0/V0Accordion.vue'
import V0Alert from '@/components/ui/provider/vuetify0/V0Alert.vue'
import V0Avatar from '@/components/ui/provider/vuetify0/V0Avatar.vue'
import V0Badge from '@/components/ui/provider/vuetify0/V0Badge.vue'
import V0Breadcrumb from '@/components/ui/provider/vuetify0/V0Breadcrumb.vue'
import V0Button from '@/components/ui/provider/vuetify0/V0Button.vue'
import V0ButtonGroup from '@/components/ui/provider/vuetify0/V0ButtonGroup.vue'
import V0Card from '@/components/ui/provider/vuetify0/V0Card.vue'
import V0CommandPalette from '@/components/ui/provider/vuetify0/V0CommandPalette.vue'
import V0Dialog from '@/components/ui/provider/vuetify0/V0Dialog.vue'
import V0Popover from '@/components/ui/provider/vuetify0/V0Popover.vue'
import V0Progress from '@/components/ui/provider/vuetify0/V0Progress.vue'
import V0Separator from '@/components/ui/provider/vuetify0/V0Separator.vue'
import V0Sheet from '@/components/ui/provider/vuetify0/V0Sheet.vue'
import V0Skeleton from '@/components/ui/provider/vuetify0/V0Skeleton.vue'
import V0Stepper from '@/components/ui/provider/vuetify0/V0Stepper.vue'
import V0Tabs from '@/components/ui/provider/vuetify0/V0Tabs.vue'
import V0Toast from '@/components/ui/provider/vuetify0/V0Toast.vue'
import V0Tooltip from '@/components/ui/provider/vuetify0/V0Tooltip.vue'

// ---------------------------------------------------------------------------
// T033 — US1 Disclosure components
// ---------------------------------------------------------------------------

describe('V0 Disclosure Components', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('V0Accordion', () => {
    const items = [
      { value: 'a', title: 'Section A', content: 'Content A' },
      { value: 'b', title: 'Section B', content: 'Content B' },
    ]

    it('mounts without error', () => {
      const wrapper = mount(V0Accordion, { props: { items } })
      expect(wrapper.find('[data-ui="accordion"]').exists()).toBe(true)
    })

    it('renders items', () => {
      const wrapper = mount(V0Accordion, { props: { items } })
      expect(wrapper.text()).toContain('Section A')
      expect(wrapper.text()).toContain('Section B')
    })

    it('defaults type to single', () => {
      const wrapper = mount(V0Accordion, { props: { items } })
      const group = wrapper.find('[data-stub="ExpansionPanel.Group"]')
      expect(group.attributes('multiple')).toBe('false')
    })
  })

  describe('V0Dialog', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Dialog)
      expect(wrapper.find('[data-stub="Dialog.Root"]').exists()).toBe(true)
    })

    it('renders title when provided', () => {
      const wrapper = mount(V0Dialog, { props: { title: 'My Dialog' } })
      expect(wrapper.text()).toContain('My Dialog')
    })

    it('renders trigger slot', () => {
      const wrapper = mount(V0Dialog, {
        slots: { trigger: '<button>Open</button>' },
      })
      expect(wrapper.text()).toContain('Open')
    })
  })

  describe('V0Popover', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Popover)
      expect(wrapper.find('[data-ui="popover"]').exists()).toBe(true)
    })

    it('renders trigger and default slots', () => {
      const wrapper = mount(V0Popover, {
        slots: { trigger: '<button>Trigger</button>', default: '<p>Content</p>' },
      })
      expect(wrapper.text()).toContain('Trigger')
      expect(wrapper.text()).toContain('Content')
    })
  })

  describe('V0Tabs', () => {
    const tabs = [
      { value: 'tab1', label: 'Tab 1' },
      { value: 'tab2', label: 'Tab 2', disabled: true },
    ]

    it('mounts without error', () => {
      const wrapper = mount(V0Tabs, { props: { tabs } })
      expect(wrapper.find('[data-ui="tabs"]').exists()).toBe(true)
    })

    it('renders tab labels', () => {
      const wrapper = mount(V0Tabs, { props: { tabs } })
      expect(wrapper.text()).toContain('Tab 1')
      expect(wrapper.text()).toContain('Tab 2')
    })
  })

  describe('V0Tooltip', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Tooltip, {
        props: { content: 'Tip text' },
        slots: { default: '<button>Hover me</button>' },
      })
      expect(wrapper.find('[data-ui="tooltip"]').exists()).toBe(true)
    })

    it('renders content text', () => {
      const wrapper = mount(V0Tooltip, {
        props: { content: 'Tip text' },
        slots: { default: '<span>T</span>' },
      })
      expect(wrapper.text()).toContain('Tip text')
    })
  })
})

// ---------------------------------------------------------------------------
// T034 — US2 Action / Semantic components
// ---------------------------------------------------------------------------

describe('V0 Action/Semantic Components', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('V0Button', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Button, { slots: { default: 'Click' } })
      expect(wrapper.find('[data-ui="button"]').exists()).toBe(true)
    })

    it('applies variant classes', () => {
      const wrapper = mount(V0Button, {
        props: { variant: 'destructive' },
        slots: { default: 'Del' },
      })
      expect(wrapper.find('[data-ui="button"]').classes().join(' ')).toContain('bg-danger-500')
    })

    it('applies size classes', () => {
      const wrapper = mount(V0Button, {
        props: { size: 'lg' },
        slots: { default: 'Big' },
      })
      expect(wrapper.find('[data-ui="button"]').classes().join(' ')).toContain('px-5')
    })

    it('emits click', async () => {
      const wrapper = mount(V0Button, { slots: { default: 'Go' } })
      await wrapper.find('[data-ui="button"]').trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('does not emit click when disabled', async () => {
      const wrapper = mount(V0Button, {
        props: { disabled: true },
        slots: { default: 'No' },
      })
      await wrapper.find('[data-ui="button"]').trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })
  })

  describe('V0ButtonGroup', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0ButtonGroup, { slots: { default: '<button>A</button>' } })
      expect(wrapper.find('[role="group"]').exists()).toBe(true)
    })
  })

  describe('V0Avatar', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Avatar)
      expect(wrapper.find('[data-ui="avatar"]').exists()).toBe(true)
    })

    it('shows fallback initials from alt', () => {
      const wrapper = mount(V0Avatar, { props: { alt: 'John Doe' } })
      expect(wrapper.text()).toContain('JD')
    })

    it('applies size classes', () => {
      const wrapper = mount(V0Avatar, { props: { size: 'xl' } })
      expect(wrapper.find('[data-ui="avatar"]').classes().join(' ')).toContain('h-16')
    })
  })

  describe('V0Breadcrumb', () => {
    const items = [
      { label: 'Home', to: '/' },
      { label: 'Products', to: '/products' },
      { label: 'Current' },
    ]

    it('mounts without error', () => {
      const wrapper = mount(V0Breadcrumb, {
        props: { items },
        global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
      })
      expect(wrapper.find('[data-ui="breadcrumb"]').exists()).toBe(true)
    })

    it('renders item labels', () => {
      const wrapper = mount(V0Breadcrumb, {
        props: { items },
        global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
      })
      expect(wrapper.text()).toContain('Home')
      expect(wrapper.text()).toContain('Products')
      expect(wrapper.text()).toContain('Current')
    })
  })

  describe('V0Progress', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Progress)
      expect(wrapper.find('[data-ui="progress"]').exists()).toBe(true)
    })

    it('shows label and percentage', () => {
      const wrapper = mount(V0Progress, {
        props: { value: 75, label: 'Upload', showValue: true },
      })
      expect(wrapper.text()).toContain('Upload')
      expect(wrapper.text()).toContain('75%')
    })

    it('applies size class', () => {
      const wrapper = mount(V0Progress, { props: { size: 'lg' } })
      const root = wrapper.find('[data-stub="Progress.Root"]')
      expect(root.classes().join(' ')).toContain('h-3.5')
    })
  })

  describe('V0Toast', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Toast, { props: { message: 'Hello' } })
      expect(wrapper.find('[data-ui="toast"]').exists()).toBe(true)
    })

    it('shows trigger label', () => {
      const wrapper = mount(V0Toast, {
        props: { message: 'Hello', triggerLabel: 'Notify' },
      })
      expect(wrapper.text()).toContain('Notify')
    })
  })

  describe('V0Stepper', () => {
    const steps = [{ label: 'Step 1', description: 'First' }, { label: 'Step 2' }]

    it('mounts without error', () => {
      const wrapper = mount(V0Stepper, { props: { steps } })
      expect(wrapper.find('[data-ui="stepper"]').exists()).toBe(true)
    })

    it('renders step labels', () => {
      const wrapper = mount(V0Stepper, { props: { steps } })
      expect(wrapper.text()).toContain('Step 1')
      expect(wrapper.text()).toContain('Step 2')
    })

    it('emits update:modelValue on step click', async () => {
      const wrapper = mount(V0Stepper, { props: { steps, modelValue: 0 } })
      const buttons = wrapper.findAll('button')
      await buttons[1]?.trigger('click')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([1])
    })
  })
})

// ---------------------------------------------------------------------------
// T035 — US3 Standalone components
// ---------------------------------------------------------------------------

describe('V0 Standalone Components', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('V0Alert', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Alert, { slots: { default: 'Warning!' } })
      expect(wrapper.find('[data-ui="alert"]').exists()).toBe(true)
    })

    it('renders title and content', () => {
      const wrapper = mount(V0Alert, {
        props: { title: 'Heads up', variant: 'warning' },
        slots: { default: 'Be careful' },
      })
      expect(wrapper.text()).toContain('Heads up')
      expect(wrapper.text()).toContain('Be careful')
    })

    it('applies variant classes', () => {
      const wrapper = mount(V0Alert, {
        props: { variant: 'error' },
        slots: { default: 'Error' },
      })
      expect(wrapper.find('[data-ui="alert"]').classes().join(' ')).toContain('bg-red-50')
    })

    it('emits dismiss', async () => {
      const wrapper = mount(V0Alert, {
        props: { dismissible: true },
        slots: { default: 'Dismiss me' },
      })
      await wrapper.find('button[aria-label="Dismiss"]').trigger('click')
      expect(wrapper.emitted('dismiss')).toHaveLength(1)
    })
  })

  describe('V0Badge', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Badge, { slots: { default: 'New' } })
      expect(wrapper.find('[data-ui="badge"]').exists()).toBe(true)
    })

    it('applies variant classes', () => {
      const wrapper = mount(V0Badge, {
        props: { variant: 'success' },
        slots: { default: 'OK' },
      })
      expect(wrapper.find('[data-ui="badge"]').classes().join(' ')).toContain('bg-green-100')
    })

    it('renders dot', () => {
      const wrapper = mount(V0Badge, {
        props: { dot: true },
        slots: { default: 'Dot' },
      })
      expect(wrapper.find('.rounded-full.h-1\\.5').exists()).toBe(true)
    })
  })

  describe('V0Card', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Card, { slots: { default: 'Content' } })
      expect(wrapper.find('[data-ui="card"]').exists()).toBe(true)
    })

    it('renders title', () => {
      const wrapper = mount(V0Card, {
        props: { title: 'Card Title' },
        slots: { default: 'Body' },
      })
      expect(wrapper.text()).toContain('Card Title')
    })

    it('renders header, default, and footer slots', () => {
      const wrapper = mount(V0Card, {
        slots: {
          header: '<span>Header</span>',
          default: 'Body',
          footer: '<span>Footer</span>',
        },
      })
      expect(wrapper.text()).toContain('Header')
      expect(wrapper.text()).toContain('Body')
      expect(wrapper.text()).toContain('Footer')
    })

    it('applies hoverable class', () => {
      const wrapper = mount(V0Card, {
        props: { hoverable: true },
        slots: { default: 'X' },
      })
      expect(wrapper.find('[data-ui="card"]').classes().join(' ')).toContain(
        'hover:shadow-elevated',
      )
    })
  })

  describe('V0CommandPalette', () => {
    const items = [
      { id: '1', label: 'Save', hint: 'Ctrl+S' },
      { id: '2', label: 'Open', hint: 'Ctrl+O' },
    ]

    it('mounts without error', () => {
      const wrapper = mount(V0CommandPalette, { props: { items } })
      expect(wrapper.find('[data-ui="command-palette"]').exists()).toBe(true)
    })

    it('renders items', () => {
      const wrapper = mount(V0CommandPalette, { props: { items } })
      expect(wrapper.text()).toContain('Save')
      expect(wrapper.text()).toContain('Open')
    })

    it('emits select on item click', async () => {
      const wrapper = mount(V0CommandPalette, { props: { items } })
      const buttons = wrapper.findAll('button')
      await buttons[0]?.trigger('click')
      expect(wrapper.emitted('select')?.[0]).toEqual(['1'])
    })

    it('filters items by query', async () => {
      const wrapper = mount(V0CommandPalette, { props: { items } })
      const input = wrapper.find('input')
      await input.setValue('save')
      expect(wrapper.text()).toContain('Save')
      expect(wrapper.text()).not.toContain('Open')
    })
  })

  describe('V0Separator', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Separator)
      expect(wrapper.find('[data-ui="separator"]').exists()).toBe(true)
    })

    it('applies horizontal classes by default', () => {
      const wrapper = mount(V0Separator)
      expect(wrapper.find('[data-ui="separator"]').classes().join(' ')).toContain('h-px')
      expect(wrapper.find('[data-ui="separator"]').classes().join(' ')).toContain('w-full')
    })

    it('applies vertical classes', () => {
      const wrapper = mount(V0Separator, { props: { orientation: 'vertical' } })
      expect(wrapper.find('[data-ui="separator"]').classes().join(' ')).toContain('w-px')
    })

    it('sets aria attributes', () => {
      const wrapper = mount(V0Separator, { props: { decorative: false } })
      expect(wrapper.find('[role="separator"]').exists()).toBe(true)
      expect(wrapper.find('[data-ui="separator"]').attributes('aria-hidden')).toBe('false')
    })
  })

  describe('V0Sheet', () => {
    it('does not render when closed', () => {
      const wrapper = mount(V0Sheet, { props: { modelValue: false } })
      expect(wrapper.find('[data-ui="sheet"]').exists()).toBe(false)
    })

    it('renders when open', () => {
      const wrapper = mount(V0Sheet, { props: { modelValue: true, title: 'Panel' } })
      expect(wrapper.find('[data-ui="sheet"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Panel')
    })

    it('emits update:modelValue on close', async () => {
      const wrapper = mount(V0Sheet, { props: { modelValue: true } })
      await wrapper.find('button[aria-label="Close sheet"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    })
  })

  describe('V0Skeleton', () => {
    it('mounts without error', () => {
      const wrapper = mount(V0Skeleton)
      expect(wrapper.find('[data-ui="skeleton"]').exists()).toBe(true)
    })

    it('applies dimensions via style', () => {
      const wrapper = mount(V0Skeleton, { props: { width: '200px', height: '20px' } })
      const style = wrapper.find('[data-ui="skeleton"]').attributes('style')
      expect(style).toContain('width: 200px')
      expect(style).toContain('height: 20px')
    })

    it('applies rounded class', () => {
      const wrapper = mount(V0Skeleton, { props: { rounded: 'full' } })
      expect(wrapper.find('[data-ui="skeleton"]').classes().join(' ')).toContain('rounded-full')
    })

    it('has animate-pulse by default', () => {
      const wrapper = mount(V0Skeleton)
      expect(wrapper.find('[data-ui="skeleton"]').classes().join(' ')).toContain('animate-pulse')
    })

    it('disables animation', () => {
      const wrapper = mount(V0Skeleton, { props: { animated: false } })
      expect(wrapper.find('[data-ui="skeleton"]').classes().join(' ')).not.toContain(
        'animate-pulse',
      )
    })

    it('has a11y attributes', () => {
      const wrapper = mount(V0Skeleton)
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      expect(wrapper.find('[data-ui="skeleton"]').attributes('aria-label')).toBe('Loading')
    })
  })
})
