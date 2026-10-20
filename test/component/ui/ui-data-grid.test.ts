import { flushPromises, mount, type MountingOptions } from '@vue/test-utils'
import type { DataTableBinding } from '@vueye-table/vue'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, defineComponent, effectScope, h, nextTick, type EffectScope } from 'vue'

import UiDataGrid from '@/components/ui/UiDataGrid.vue'
import {
  createColumns,
  useDataTable,
  type ColumnDef,
  type UseDataTableOptions,
} from '@/composables/useDataTable'
import { i18n } from '@/plugins/i18n'

interface UserRow {
  id: string
  name: string
  role: string
  active: boolean
  team?: UserRow[]
}

const col = createColumns<UserRow>()

const baseColumns: ColumnDef<UserRow>[] = [
  col.text('name', {
    label: 'Name',
    filter: {
      variant: 'text',
      placeholder: 'Filter name',
    },
  }),
  col.text('role', {
    label: 'Role',
    filter: {
      variant: 'select',
      options: [
        { label: 'Admin', value: 'Admin' },
        { label: 'Member', value: 'Member' },
      ],
    },
  }),
  col.text('active', {
    label: 'Active',
    format: (active) => (active ? 'Yes' : 'No'),
    filter: {
      variant: 'boolean',
    },
    align: 'center',
  }),
]

const flatRows: UserRow[] = [
  { id: '1', name: 'Ada Lovelace', role: 'Admin', active: true },
  { id: '2', name: 'Grace Hopper', role: 'Member', active: false },
  { id: '3', name: 'Margaret Hamilton', role: 'Member', active: true },
]

const treeRows: UserRow[] = [
  {
    id: 'team-a',
    name: 'Platform',
    role: 'Admin',
    active: true,
    team: [{ id: 'team-a-1', name: 'Ops', role: 'Member', active: true }],
  },
  { id: 'team-b', name: 'Product', role: 'Member', active: false },
]
const scopes: EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  i18n.global.locale.value = 'en'
  vi.restoreAllMocks()
})

function createGrid(options?: {
  rows?: UserRow[]
  columns?: ColumnDef<UserRow>[]
  tableOptions?: Partial<Omit<UseDataTableOptions<UserRow>, 'data' | 'columns'>>
  props?: Record<string, unknown>
  slots?: MountingOptions<unknown>['slots']
}) {
  const rows = options?.rows ?? flatRows
  const columns = options?.columns ?? baseColumns
  const scope = effectScope()
  scopes.push(scope)
  const tableState = scope.run(() =>
    useDataTable<UserRow>({
      data: rows,
      columns,
      initialState: { pagination: { page: 1, pageSize: 2 } },
      ...options?.tableOptions,
    }),
  )!

  const wrapper = mount(UiDataGrid, {
    props: {
      table: tableState.table.value as DataTableBinding<unknown>,
      selectable: true,
      showColumnVisibility: true,
      ...options?.props,
    },
    slots: options?.slots as Record<string, (...args: any[]) => any> | undefined,
    global: {
      stubs: {
        UiBadge: defineComponent({
          name: 'UiBadgeStub',
          setup(_, { slots: badgeSlots }) {
            return () => h('span', { 'data-ui': 'badge-stub' }, badgeSlots.default?.())
          },
        }),
        UiButton: defineComponent({
          name: 'UiButtonStub',
          props: {
            disabled: Boolean,
          },
          emits: ['click'],
          setup(buttonProps, { slots: buttonSlots, emit }) {
            return () =>
              h(
                'button',
                {
                  disabled: buttonProps.disabled,
                  onClick: (event: MouseEvent) => emit('click', event),
                },
                buttonSlots.default?.(),
              )
          },
        }),
        UiCheckbox: defineComponent({
          name: 'UiCheckboxStub',
          props: {
            modelValue: {
              type: [Boolean, String],
              default: false,
            },
            disabled: Boolean,
          },
          emits: ['update:modelValue'],
          setup(checkboxProps, { emit }) {
            return () =>
              h(
                'button',
                {
                  type: 'button',
                  disabled: checkboxProps.disabled,
                  'data-ui': 'checkbox',
                  'data-state': String(checkboxProps.modelValue),
                  onClick: () => {
                    const nextValue =
                      checkboxProps.modelValue === 'indeterminate'
                        ? true
                        : !checkboxProps.modelValue

                    emit('update:modelValue', nextValue)
                  },
                },
                [],
              )
          },
        }),
        UiPopover: defineComponent({
          name: 'UiPopoverStub',
          setup(_, { slots: popoverSlots }) {
            return () =>
              h('div', { 'data-ui': 'popover-stub' }, [
                popoverSlots.trigger?.(),
                popoverSlots.default?.(),
              ])
          },
        }),
        UiSelect: defineComponent({
          name: 'UiSelectStub',
          props: {
            modelValue: {
              type: [String, Number, Array],
              default: undefined,
            },
            options: {
              type: Array,
              default: () => [],
            },
            placeholder: {
              type: String,
              default: '',
            },
          },
          emits: ['update:modelValue'],
          setup(selectProps, { emit }) {
            const normalizedValue = computed(() => {
              const rawValue = Array.isArray(selectProps.modelValue)
                ? selectProps.modelValue[0]
                : selectProps.modelValue

              return typeof rawValue === 'string' || typeof rawValue === 'number'
                ? String(rawValue)
                : ''
            })

            return () =>
              h(
                'select',
                {
                  'data-ui': 'select-stub',
                  value: normalizedValue.value,
                  onChange: (event: Event) =>
                    emit('update:modelValue', (event.target as HTMLSelectElement).value),
                },
                [
                  h('option', { value: '' }, selectProps.placeholder || 'Select'),
                  ...(selectProps.options as Array<{ label: string; value: string | number }>).map(
                    (option) => h('option', { value: String(option.value) }, option.label),
                  ),
                ],
              )
          },
        }),
      },
    },
  })

  return { wrapper, ...tableState }
}

async function mountGrid(options?: Parameters<typeof createGrid>[0]) {
  const fixture = createGrid(options)
  await vi.waitFor(
    () => expect(fixture.wrapper.find('[data-ui="data-grid"]').exists()).toBe(true),
    { timeout: 10_000 },
  )
  return fixture
}

describe('UiDataGrid', () => {
  it('loads the public renderer on demand and forwards loading props, updates and slots', async () => {
    const { wrapper } = createGrid({
      props: {
        loading: true,
        loadingText: 'Fetching customers',
        ariaLabel: 'Customers directory',
        embedded: true,
        showFooter: false,
      },
      slots: {
        'cell-name': ({ rowKey, value }: { rowKey: string; value: unknown }) =>
          h('strong', { 'data-forwarded-key': rowKey }, String(value)),
      },
    })
    expect(wrapper.find('table').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.find('table').exists()).toBe(true), { timeout: 10_000 })
    expect(wrapper.get('table').attributes('aria-label')).toBe('Customers directory')
    expect(wrapper.get('table').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Fetching customers')
    expect(wrapper.find('[data-forwarded-key]').exists()).toBe(false)
    expect(wrapper.get('[data-ui="data-grid"]').attributes('data-embedded')).toBe('true')
    await wrapper.setProps({ loading: false })
    expect(wrapper.get('table').attributes('aria-busy')).toBe('false')
    expect(wrapper.get('[data-forwarded-key="1"]').text()).toBe('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Fetching customers')
    expect(wrapper.text()).not.toContain('Showing 1-2')
  })

  it('renders visible rows and pagination summary', async () => {
    const { wrapper } = await mountGrid()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).toContain('Showing 1-2 of 3 rows')
    expect(wrapper.text()).toContain('Page 1 of 2')
  })

  it('updates global search through the toolbar input', async () => {
    const { wrapper, table } = await mountGrid({ props: { showColumnFilters: false } })

    const input = wrapper.find('[data-ui="data-grid-search"]')
    await input.setValue('Grace')

    expect(table.value.state.search).toBe('Grace')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).not.toContain('Ada Lovelace')
  })

  it('renders semantic column headers and keyboard-focusable sorting controls', async () => {
    const { wrapper, table } = await mountGrid()
    const heading = wrapper.get('th[data-column="name"]')
    expect(heading.attributes('scope')).toBe('col')
    expect(heading.attributes('aria-sort')).toBe('none')
    const control = heading.get('button[data-ui="data-grid-sort"]')
    expect(control.attributes('type')).toBe('button')
    await control.trigger('click')
    expect(heading.attributes('aria-sort')).toBe('ascending')
    expect(table.value.state.sorting).toEqual([{ column: 'name', direction: 'asc' }])
    await control.trigger('click')
    expect(heading.attributes('aria-sort')).toBe('descending')
  })

  it('uses text and choice controls to apply native column filters', async () => {
    const { wrapper, table } = await mountGrid()
    await wrapper.get('input[aria-label="Filter Name"]').setValue('Grace')
    expect(table.value.state.filters).toEqual({ name: 'Grace' })
    expect(wrapper.text()).not.toContain('Ada Lovelace')
    table.value.filter('name', undefined)
    await nextTick()
    await wrapper.get('th[data-column="active"] select').setValue('false')
    expect(table.value.state.filters.active).toBe(false)
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).not.toContain('Ada Lovelace')
  })
  it('clears both the search and column filters from the toolbar', async () => {
    const { wrapper, table } = await mountGrid()
    table.value.search('Grace')
    table.value.filter('active', false)
    await nextTick()
    const clear = wrapper.findAll('button').find((button) => button.text() === 'Clear filters')!
    await clear.trigger('click')
    expect(table.value.state.search).toBe('')
    expect(table.value.state.filters).toEqual({})
    expect(wrapper.text()).toContain('Ada Lovelace')
  })

  it('preserves row selection when moving between pages', async () => {
    const { wrapper, table } = await mountGrid()
    await wrapper.get('[data-row-id="1"] [data-ui="checkbox"]').trigger('click')
    await wrapper.get('[data-ui="data-grid-next-page"]').trigger('click')
    expect(wrapper.text()).toContain('Margaret Hamilton')
    await wrapper.get('[data-row-id="3"] [data-ui="checkbox"]').trigger('click')
    expect(table.value.state.selection).toEqual(['1', '3'])
    expect(wrapper.text()).toContain('2 selected')
  })

  it('passes raw rows, cell values and stable keys to custom cell slots', async () => {
    const { wrapper } = await mountGrid({
      slots: {
        'cell-name': ({ row, value, rowKey }: { row: UserRow; value: unknown; rowKey: string }) =>
          h('strong', { 'data-custom-key': rowKey }, `${row.role}: ${String(value)}`),
      },
    })
    expect(wrapper.get('[data-custom-key="1"]').text()).toBe('Admin: Ada Lovelace')
    expect(wrapper.get('[data-custom-key="2"]').text()).toBe('Member: Grace Hopper')
  })

  it('keeps nonhideable action columns out of the visibility chooser', async () => {
    const { wrapper } = await mountGrid({
      columns: [
        ...baseColumns,
        col.display('actions', { label: 'Row actions', hideable: false, cell: () => 'Edit' }),
      ],
    })
    expect(wrapper.get('th[data-column="actions"]').text()).toBe('Row actions')
    expect(wrapper.findAll('[data-ui="popover-stub"]').at(0)?.text()).not.toContain('Row actions')
  })

  it('toggles page row selection through the header checkbox', async () => {
    const { wrapper, table } = await mountGrid()

    await wrapper.find('[data-ui="data-grid-select-all"] [data-ui="checkbox"]').trigger('click')

    expect(table.value.state.selection).toHaveLength(2)
    expect(wrapper.text()).toContain('2 selected')
  })

  it('supports expanded detail rows via slot content', async () => {
    const { wrapper, table } = await mountGrid({
      props: { expandable: true },
      tableOptions: {
        getRowCanExpand: () => true,
      },
      slots: {
        'expanded-row': ({ row }: { row: UserRow }) => `Details for ${row.name}`,
      },
    })

    await wrapper.find('[data-ui="data-grid-expander"]').trigger('click')

    expect(table.value.rows[0]?.isExpanded).toBe(true)
    expect(wrapper.text()).toContain('Details for Ada Lovelace')
  })

  it('renders tree rows when sub rows are provided', async () => {
    const { wrapper } = await mountGrid({
      rows: treeRows,
      props: { expandable: true, showPagination: false, showFooter: false },
      tableOptions: {
        rowKey: 'id',
        getChildren: (row) => row.team,
      },
    })

    await wrapper.find('[data-ui="data-grid-expander"]').trigger('click')

    expect(wrapper.text()).toContain('Platform')
    expect(wrapper.text()).toContain('Ops')
  })

  it('provides native tree semantics and directional expansion from the focused row', async () => {
    const { wrapper, table } = await mountGrid({
      rows: treeRows,
      props: { expandable: true },
      tableOptions: { rowKey: 'id', getChildren: (row) => row.team },
    })
    expect(wrapper.get('table').attributes('role')).toBe('treegrid')
    const parent = wrapper.get('[data-row-id="team-a"]')
    expect(parent.attributes('aria-level')).toBe('1')
    expect(parent.attributes('aria-expanded')).toBe('false')
    expect(parent.attributes('tabindex')).toBe('0')
    await parent.trigger('keydown', { key: 'ArrowRight' })
    expect(table.value.state.expanded).toEqual(['team-a'])
    expect(wrapper.get('[data-row-id="team-a-1"]').attributes('aria-level')).toBe('2')
  })

  it.each([
    ['en', 'Expand row', 'Loading', 'Retry'],
    ['fr', 'Développer la ligne', 'Chargement', 'Réessayer'],
    ['ar', 'توسيع الصف', 'جارٍ التحميل', 'إعادة المحاولة'],
  ])(
    'localizes native tree controls and asynchronous loading/error messages in %s',
    async (language, expand, loading, retry) => {
      i18n.global.locale.value = language
      let fail!: (reason: Error) => void
      const { wrapper, table } = await mountGrid({
        tableOptions: {
          hasChildren: (row) => row.id === '1',
          loadChildren: () =>
            new Promise<UserRow[]>((_, reject) => {
              fail = reject
            }),
        },
        props: { showColumnFilters: false, showSearch: false, showFooter: false },
      })
      expect(wrapper.get('[data-expand-toggle]').attributes('aria-label')).toBe(expand)
      table.value.toggleExpanded('1')
      await nextTick()
      expect(wrapper.get('.vt-tree-loading').text()).toBe(loading)
      fail(new Error('offline'))
      await flushPromises()
      expect(wrapper.get('.vt-tree-retry').text()).toBe(retry)
      expect(wrapper.get('.vt-tree-error').text()).not.toContain('Could not load children')
    },
  )

  it('renders a virtual body for flat rows when virtual mode is enabled', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(520)
    const { wrapper } = await mountGrid({
      props: { virtual: true, showColumnFilters: false },
    })

    expect(wrapper.find('[data-ui="data-grid-virtual-body"]').exists()).toBe(true)
    expect(wrapper.find('table[data-virtual]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Ada Lovelace')
  })

  it('virtualizes a large flat table without replacing native table semantics', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(520)
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      name: `Person ${index}`,
      role: 'Member',
      active: true,
    }))
    const { wrapper } = await mountGrid({
      rows,
      tableOptions: { paginate: false },
      props: { virtual: true, showColumnFilters: false },
    })
    expect(wrapper.findAll('tbody tr[data-row-id]').length).toBeLessThan(500)
    expect(wrapper.findAll('tbody tr[data-row-id]').length).toBeGreaterThan(0)
    expect(wrapper.get('table').attributes('aria-rowcount')).toBe('501')
    const viewport = wrapper.get('[data-ui="data-grid-virtual-body"]')
    const scrollElement = viewport.element as HTMLElement
    scrollElement.scrollTop = 5_000
    await viewport.trigger('scroll')
    expect(wrapper.find('[data-row-id="0"]').exists()).toBe(false)
    expect(wrapper.find('[data-row-id="96"]').exists()).toBe(true)
  })

  it('falls back to the table renderer when virtual mode is incompatible with expanded rows', async () => {
    const { wrapper } = await mountGrid({
      props: { virtual: true, expandable: true },
      tableOptions: {
        getRowCanExpand: () => true,
      },
      slots: {
        'expanded-row': ({ row }: { row: UserRow }) => `Details for ${row.name}`,
      },
    })

    expect(wrapper.find('[data-ui="data-grid-virtual-body"]').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('shows column filters for client tables by default', async () => {
    const { wrapper } = await mountGrid()

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(true)
  })

  it('hides column filters for manual server tables by default', async () => {
    const { wrapper } = await mountGrid({
      tableOptions: {
        manual: true,
        rowCount: 3,
      },
      props: { manual: true },
    })

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(false)
  })

  it('shows column filters on a server table when explicitly enabled', async () => {
    const { wrapper } = await mountGrid({
      tableOptions: {
        manual: true,
        rowCount: 3,
      },
      props: { manual: true, showColumnFilters: true },
    })

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(true)
  })

  it('drops outer card chrome when embedded in a panel', async () => {
    const { wrapper } = await mountGrid({ props: { embedded: true } })

    expect(wrapper.get('[data-ui="data-grid"]').attributes('data-embedded')).toBe('true')
    expect(wrapper.get('[data-ui="data-grid"]').classes()).not.toContain('rounded-2xl')
  })

  it('renders an error empty state and emits retry', async () => {
    const { wrapper } = await mountGrid({ props: { error: true } })

    expect(wrapper.text()).toContain('Something went wrong')
    expect(wrapper.text()).not.toContain('Ada Lovelace')

    await wrapper.get('[role="alert"]').find('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
