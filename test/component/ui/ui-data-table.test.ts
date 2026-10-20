import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, effectScope, nextTick, ref, type EffectScope } from 'vue'

import UiDataTable from '@/components/ui/UiDataTable.vue'
import { createColumns, useDataTable } from '@/composables/useDataTable'

interface Person {
  id: string
  name: string
}
const scopes: EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

function createBinding(rows: Person[]) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() =>
    useDataTable<Person>({
      data: rows,
      columns: [createColumns<Person>().text('name', { label: 'Name' })],
    }),
  )!.table.value
}

describe('UiDataTable public async boundary', () => {
  it('loads on demand and forwards native bindings, accessible labels and typed cell slots', async () => {
    const table = createBinding([{ id: 'ada', name: 'Ada Lovelace' }])
    const ariaLabel = ref('Team members')
    const Host = defineComponent({
      components: { UiDataTable },
      setup: () => ({ table, ariaLabel }),
      template:
        '<UiDataTable :table="table" :aria-label="ariaLabel"><template #cell-name="{ row, value, rowKey }"><strong :data-person-id="rowKey">{{ row.id }}: {{ value }}</strong></template></UiDataTable>',
    })
    const wrapper = mount(Host)
    expect(wrapper.find('table').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.find('table').exists()).toBe(true), { timeout: 10_000 })
    expect(wrapper.get('table').attributes('aria-label')).toBe('Team members')
    expect(wrapper.get('[data-person-id="ada"]').text()).toBe('ada: Ada Lovelace')
    await wrapper.get('th button').trigger('click')
    expect(table.state.sorting).toEqual([{ column: 'name', direction: 'asc' }])
    expect(wrapper.get('th').attributes('aria-sort')).toBe('ascending')
    ariaLabel.value = 'Updated team members'
    await nextTick()
    expect(wrapper.get('table').attributes('aria-label')).toBe('Updated team members')
  })

  it('forwards and updates an empty-state message after the renderer resolves', async () => {
    const table = createBinding([])
    const emptyText = ref('No team members yet')
    const Host = defineComponent({
      components: { UiDataTable },
      setup: () => ({ table, emptyText }),
      template: '<UiDataTable :table="table" :empty-text="emptyText" />',
    })
    const wrapper = mount(Host)
    await vi.waitFor(() => expect(wrapper.find('table').exists()).toBe(true), { timeout: 10_000 })
    expect(wrapper.text()).toContain('No team members yet')
    emptyText.value = 'No matching team members'
    await nextTick()
    expect(wrapper.text()).toContain('No matching team members')
    expect(wrapper.text()).not.toContain('No team members yet')
  })
})
