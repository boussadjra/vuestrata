import type { Table } from '@tanstack/vue-table'
import { mount, type MountingOptions } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'
import { computed, defineComponent, h } from 'vue'

import UiDataGrid from '@/components/ui/UiDataGrid.vue'
import {
  createColumnHelper,
  useDataTable,
  type ColumnDef,
  type UseDataTableOptions,
} from '@/composables/useDataTable'

interface UserRow {
  id: string
  name: string
  role: string
  active: boolean
  team?: UserRow[]
}

const helper = createColumnHelper<UserRow>()

const baseColumns: ColumnDef<UserRow>[] = [
  helper.accessor('name', {
    header: 'Name',
    meta: {
      label: 'Name',
      filter: {
        variant: 'text',
        placeholder: 'Filter name',
      },
    },
  }),
  helper.accessor('role', {
    header: 'Role',
    meta: {
      label: 'Role',
      filter: {
        variant: 'select',
        options: [
          { label: 'Admin', value: 'Admin' },
          { label: 'Member', value: 'Member' },
        ],
      },
    },
  }),
  helper.accessor('active', {
    header: 'Active',
    cell: (info) => (info.getValue() ? 'Yes' : 'No'),
    meta: {
      label: 'Active',
      filter: {
        variant: 'boolean',
      },
      align: 'center',
    },
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

function mountGrid(options?: {
  rows?: UserRow[]
  columns?: ColumnDef<UserRow>[]
  tableOptions?: Partial<Omit<UseDataTableOptions<UserRow>, 'data' | 'columns'>>
  props?: Record<string, unknown>
  slots?: MountingOptions<unknown>['slots']
}) {
  const rows = options?.rows ?? flatRows
  const columns = options?.columns ?? baseColumns
  const tableState = useDataTable<UserRow>({
    data: rows,
    columns,
    enableFiltering: true,
    enablePagination: true,
    enableRowSelection: true,
    enableColumnVisibility: true,
    pageSize: 2,
    ...options?.tableOptions,
  })

  const wrapper = mount(UiDataGrid, {
    props: {
      table: tableState.table as Table<unknown>,
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

describe('UiDataGrid', () => {
  it('renders visible rows and pagination summary', () => {
    const { wrapper } = mountGrid()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).toContain('Showing 1-2 of 3 rows')
    expect(wrapper.text()).toContain('Page 1 of 2')
  })

  it('updates global search through the toolbar input', async () => {
    const { wrapper, table } = mountGrid({ props: { showColumnFilters: false } })

    const input = wrapper.find('[data-ui="data-grid-search"]')
    await input.setValue('Grace')

    expect(String(table.getState().globalFilter ?? '')).toBe('Grace')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).not.toContain('Ada Lovelace')
  })

  it('toggles page row selection through the header checkbox', async () => {
    const { wrapper, table } = mountGrid()

    await wrapper.find('[data-ui="data-grid-select-all"] [data-ui="checkbox"]').trigger('click')

    expect(table.getSelectedRowModel().rows).toHaveLength(2)
    expect(wrapper.text()).toContain('2 selected')
  })

  it('supports expanded detail rows via slot content', async () => {
    const { wrapper, table } = mountGrid({
      props: { expandable: true },
      tableOptions: {
        enableExpanding: true,
        getRowCanExpand: () => true,
      },
      slots: {
        'expanded-row': ({ row }: { row: { original: UserRow } }) =>
          `Details for ${row.original.name}`,
      },
    })

    await wrapper.find('[data-ui="data-grid-expander"]').trigger('click')

    expect(table.getRowModel().rows[0]?.getIsExpanded()).toBe(true)
    expect(wrapper.text()).toContain('Details for Ada Lovelace')
  })

  it('renders tree rows when sub rows are provided', async () => {
    const { wrapper } = mountGrid({
      rows: treeRows,
      props: { expandable: true, showPagination: false, showFooter: false },
      tableOptions: {
        enableExpanding: true,
        getRowId: (row) => row.id,
        getSubRows: (row) => row.team,
      },
    })

    await wrapper.find('[data-ui="data-grid-expander"]').trigger('click')

    expect(wrapper.text()).toContain('Platform')
    expect(wrapper.text()).toContain('Ops')
  })

  it('renders a virtual body for flat rows when virtual mode is enabled', () => {
    const { wrapper } = mountGrid({
      props: { virtual: true, showColumnFilters: false },
    })

    expect(wrapper.find('[data-ui="data-grid-virtual-body"]').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('falls back to the table renderer when virtual mode is incompatible with expanded rows', () => {
    const { wrapper } = mountGrid({
      props: { virtual: true, expandable: true },
      tableOptions: {
        enableExpanding: true,
        getRowCanExpand: () => true,
      },
      slots: {
        'expanded-row': ({ row }: { row: { original: UserRow } }) =>
          `Details for ${row.original.name}`,
      },
    })

    expect(wrapper.find('[data-ui="data-grid-virtual-body"]').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('shows column filters for client tables by default', () => {
    const { wrapper } = mountGrid()

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(true)
  })

  it('hides column filters for manual server tables by default', () => {
    const { wrapper } = mountGrid({
      tableOptions: {
        manualFiltering: true,
        manualPagination: true,
        manualSorting: true,
        rowCount: 3,
      },
    })

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(false)
  })

  it('shows column filters on a server table when explicitly enabled', () => {
    const { wrapper } = mountGrid({
      tableOptions: {
        manualFiltering: true,
        manualPagination: true,
        manualSorting: true,
        rowCount: 3,
      },
      props: { showColumnFilters: true },
    })

    expect(wrapper.find('[data-ui="data-grid-filter-button"]').exists()).toBe(true)
  })

  it('drops outer card chrome when embedded in a panel', () => {
    const { wrapper } = mountGrid({ props: { embedded: true } })

    expect(wrapper.get('[data-ui="data-grid"]').attributes('data-embedded')).toBe('true')
    expect(wrapper.get('[data-ui="data-grid"]').classes()).not.toContain('rounded-2xl')
  })

  it('renders an error empty state and emits retry', async () => {
    const { wrapper } = mountGrid({ props: { error: true } })

    expect(wrapper.text()).toContain('Something went wrong')
    expect(wrapper.text()).not.toContain('Ada Lovelace')

    await wrapper.get('[role="alert"]').find('button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
