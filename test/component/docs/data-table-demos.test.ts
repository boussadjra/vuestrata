import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import DataTableEmptyDemo from '@/components/docs/demos/DataTableEmptyDemo.vue'
import DataTableErrorDemo from '@/components/docs/demos/DataTableErrorDemo.vue'
import DataTableMinimalDemo from '@/components/docs/demos/DataTableMinimalDemo.vue'
import DataTablePublicApiDemo from '@/components/docs/demos/DataTablePublicApiDemo.vue'
import DataTableRichDemo from '@/components/docs/demos/DataTableRichDemo.vue'
import DataTableSelectionDemo from '@/components/docs/demos/DataTableSelectionDemo.vue'
import DataTableServerDemo from '@/components/docs/demos/DataTableServerDemo.vue'
import DataTableTreeDemo from '@/components/docs/demos/DataTableTreeDemo.vue'
import DataTableTypedCellsDemo from '@/components/docs/demos/DataTableTypedCellsDemo.vue'
import DataTableVirtualDemo from '@/components/docs/demos/DataTableVirtualDemo.vue'

const mounted: VueWrapper[] = []
const clients: QueryClient[] = []

async function mountDemo(component: Component) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(queryClient)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  const wrapper = mount(component, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-provider="vueye"]').exists()).toBe(true), {
    timeout: 10_000,
  })
  return wrapper
}

function actionButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  expect(button, `the ${text} action is visible`).toBeDefined()
  return button!
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  for (const client of clients.splice(0)) client.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('native table documentation examples', () => {
  it('renders minimal native columns and typed money/link/status cells', async () => {
    const minimal = await mountDemo(DataTableMinimalDemo)
    expect(minimal.get('[data-provider="vueye"]').attributes('data-ui')).toBe('datatable')
    expect(minimal.text()).toContain('Fix login bug')

    const invoices = await mountDemo(DataTableTypedCellsDemo)
    expect(invoices.get('a[href="/components/data-table"]').text()).toBe('Northwind Labs')
    expect(invoices.text()).toContain('Paid')
    expect(invoices.text()).toContain('$1,845.00')
    expect(invoices.text()).not.toContain('[object Object]')
  })

  it('keeps rich detail records and selection usable after filtering', async () => {
    const wrapper = await mountDemo(DataTableRichDemo)
    expect(wrapper.findAll('[data-row-id]')).toHaveLength(5)
    await wrapper.get('[data-row-id="1"] [data-ui="data-grid-expander"]').trigger('click')
    expect(wrapper.text()).toContain('Owns release templates and final QA signoff')

    await wrapper.get('[data-row-id="1"] [role="checkbox"]').trigger('click')
    expect(wrapper.text()).toContain('1 selected')
    await wrapper.get('[data-ui="data-grid-search"]').setValue('Grace')
    expect(wrapper.findAll('[data-row-id]')).toHaveLength(1)
    expect(wrapper.get('[data-row-id]').attributes('data-row-id')).toBe('2')
    expect(wrapper.text()).toContain('1 selected')

    const selection = await mountDemo(DataTableSelectionDemo)
    await selection.get('[data-row-id="d-1"] [role="checkbox"]').trigger('click')
    expect(selection.text()).toContain('1 selected: Imani Okonkwo')
  })

  it('expands nested rows and keeps the long-list example virtual', async () => {
    const tree = await mountDemo(DataTableTreeDemo)
    expect(tree.findAll('[data-row-id]')).toHaveLength(3)
    await tree.get('[data-row-id="platform"] [data-ui="data-grid-expander"]').trigger('click')
    expect(tree.findAll('[data-row-id]')).toHaveLength(5)
    expect(tree.get('[data-row-id="platform-ops"]').text()).toContain('Ops')

    // jsdom reports zero layout height; give the real virtualizer a viewport.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320)
    const virtual = await mountDemo(DataTableVirtualDemo)
    expect(virtual.find('[data-ui="data-grid-virtual-body"]').exists()).toBe(true)
    await vi.waitFor(() => expect(virtual.findAll('[data-row-id]').length).toBeGreaterThan(0))
    expect(virtual.findAll('[data-row-id]').length).toBeLessThan(220)
    expect(virtual.text()).toContain('220')
  })

  it('distinguishes an empty collection from a failed request and retries', async () => {
    const empty = await mountDemo(DataTableEmptyDemo)
    expect(empty.text()).toContain('No records found.')
    expect(empty.findAll('button').some((button) => button.text() === 'Retry')).toBe(false)

    const failed = await mountDemo(DataTableErrorDemo)
    expect(actionButton(failed, 'Retry').exists()).toBe(true)
    expect(failed.find('[data-row-id]').exists()).toBe(false)
    await actionButton(failed, 'Retry').trigger('click')
    expect(failed.get('[data-row-id="1"]').text()).toContain('Ada Lovelace')
  })

  it('uses native one-based manual pages without losing the server total', async () => {
    const wrapper = await mountDemo(DataTableServerDemo)
    await flushPromises()
    expect(wrapper.findAll('[data-row-id]')).toHaveLength(4)
    expect(wrapper.text()).toContain('10')
    expect(wrapper.get('[data-row-id="ws-1"]').text()).toContain('Atlas')
    await actionButton(wrapper, 'Next').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-row-id="ws-5"]').text()).toContain('Ember')
    expect(wrapper.find('[data-row-id="ws-1"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Page 2 of 3')
  })

  it('shows deterministic local rows when the public API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const wrapper = await mountDemo(DataTablePublicApiDemo)
    await flushPromises()
    expect(wrapper.text()).toContain('local 10-row fallback')
    expect(wrapper.findAll('[data-row-id]')).toHaveLength(5)
    expect(wrapper.get('[data-row-id="1"]').text()).toContain('Leanne Graham')
  })
})
