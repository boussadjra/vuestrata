<script setup lang="ts" generic="TData extends RowData">
import { FlexRender, type Column, type Row, type RowData, type Table } from '@tanstack/vue-table'
import { useVirtualList } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import type { DataTableFilterOption } from '@/composables/useDataTable'
import { resolveIcon } from '~/config/icon-provider'

import UiBadge from './UiBadge.vue'
import UiButton from './UiButton.vue'
import UiCheckbox from './UiCheckbox.vue'
import UiPopover from './UiPopover.vue'
import UiSelect from './UiSelect.vue'

interface ActiveFilterChip {
  key: string
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    table: Table<TData>
    emptyText?: string
    loading?: boolean
    loadingText?: string
    ariaLabel?: string
    showToolbar?: boolean
    showSearch?: boolean
    searchPlaceholder?: string
    showColumnFilters?: boolean
    showColumnVisibility?: boolean
    showFooter?: boolean
    showPagination?: boolean
    selectable?: boolean
    expandable?: boolean
    virtual?: boolean
    virtualRowHeight?: number
    maxBodyHeight?: number | string
    pageSizeOptions?: number[]
    totalRows?: number
  }>(),
  {
    loading: false,
    ariaLabel: 'Data grid',
    showToolbar: true,
    showSearch: true,
    showColumnFilters: true,
    showColumnVisibility: true,
    showFooter: true,
    showPagination: true,
    selectable: false,
    expandable: false,
    virtual: false,
    virtualRowHeight: 52,
    maxBodyHeight: '32rem',
    pageSizeOptions: () => [10, 25, 50, 100],
    totalRows: undefined,
  },
)

const slots = useSlots()
const { t } = useI18n()

const headerGroups = computed(() => props.table.getHeaderGroups())
const visibleLeafColumns = computed(() => props.table.getVisibleLeafColumns())
const allLeafColumns = computed(() => props.table.getAllLeafColumns())
const bodyRows = computed(() => props.table.getRowModel().rows)
const paginationState = computed(() => props.table.getState().pagination)
const currentPage = computed(() => paginationState.value.pageIndex + 1)
const pageCount = computed(() => props.table.getPageCount())
const pageSizeOptions = computed(() =>
  props.pageSizeOptions.map((value) => ({ label: String(value), value })),
)
const selectedCount = computed(() => props.table.getSelectedRowModel().rows.length)
const resolvedSearchPlaceholder = computed(() => props.searchPlaceholder ?? t('common_search'))
const resolvedLoadingText = computed(() => props.loadingText ?? t('common_loading'))
const resolvedEmptyText = computed(() => props.emptyText ?? t('common_no_results'))
const globalSearch = computed({
  get: () => String(props.table.getState().globalFilter ?? ''),
  set: (value: string) => props.table.setGlobalFilter(value),
})
const selectAllState = computed<boolean | 'indeterminate'>(() => {
  if (props.table.getIsAllPageRowsSelected()) return true
  if (props.table.getIsSomePageRowsSelected()) return 'indeterminate'
  return false
})
const totalColumnCount = computed(
  () => visibleLeafColumns.value.length + Number(props.selectable) + Number(props.expandable),
)
const configuredRowCount = computed(() => {
  const rowCount = props.table.options.rowCount
  return typeof rowCount === 'number' ? rowCount : undefined
})
const filteredRowCount = computed(() => props.table.getFilteredRowModel().rows.length)
const effectiveTotalRows = computed(
  () => props.totalRows ?? configuredRowCount.value ?? filteredRowCount.value,
)
const pageRangeStart = computed(() => {
  if (!bodyRows.value.length) return 0
  return paginationState.value.pageIndex * paginationState.value.pageSize + 1
})
const pageRangeEnd = computed(() => {
  if (!bodyRows.value.length) return 0
  return pageRangeStart.value + bodyRows.value.length - 1
})
const columnVisibilityColumns = computed(() =>
  allLeafColumns.value.filter((column) => column.getCanHide()),
)
const filterableColumns = computed(() => allLeafColumns.value.filter((column) => hasFilter(column)))
const hasExpandedRowSlot = computed(() => Boolean(slots['expanded-row']))
const virtualSupported = computed(
  () =>
    props.virtual &&
    headerGroups.value.length === 1 &&
    !props.expandable &&
    !hasExpandedRowSlot.value &&
    bodyRows.value.every((row) => row.depth === 0),
)
const normalizedMaxBodyHeight = computed(() =>
  typeof props.maxBodyHeight === 'number' ? `${props.maxBodyHeight}px` : props.maxBodyHeight,
)
const virtualGridTemplateColumns = computed(() => {
  const columns: string[] = []

  if (props.selectable) columns.push('48px')

  for (const column of visibleLeafColumns.value) {
    columns.push(`${column.getSize()}px`)
  }

  return columns.join(' ')
})
const activeFilters = computed<ActiveFilterChip[]>(() => {
  const chips: ActiveFilterChip[] = []

  if (globalSearch.value.trim()) {
    chips.push({
      key: 'global',
      label: t('common_search_label'),
      value: globalSearch.value.trim(),
    })
  }

  for (const column of filterableColumns.value) {
    const value = column.getFilterValue()

    if (value === undefined || value === null || value === '') continue

    chips.push({
      key: column.id,
      label: getColumnLabel(column),
      value: formatFilterValue(column, value),
    })
  }

  return chips
})

const {
  list: virtualRows,
  containerProps,
  wrapperProps,
} = useVirtualList(bodyRows, {
  itemHeight: props.virtualRowHeight,
})

const baseTextInputClass =
  'shaped-border shaped-radius-sm w-full border border-surface-300 bg-white px-3 py-2 text-sm text-surface-700 transition-colors placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 dark:placeholder:text-surface-500'

function getColumnLabel(column: Column<TData, unknown>): string {
  const metaLabel = column.columnDef.meta?.label

  if (metaLabel) return metaLabel
  if (typeof column.columnDef.header === 'string') return column.columnDef.header

  return column.id
}

function hasFilter(column: Column<TData, unknown>): boolean {
  return Boolean(column.getCanFilter() && column.columnDef.meta?.filter)
}

function isFilterActive(column: Column<TData, unknown>): boolean {
  const value = column.getFilterValue()
  return value !== undefined && value !== null && value !== ''
}

function getHeaderTextAlignClass(column: Column<TData, unknown>): string {
  switch (column.columnDef.meta?.align) {
    case 'center':
      return 'text-center'
    case 'end':
      return 'text-end'
    default:
      return 'text-start'
  }
}

function getCellTextAlignClass(column: Column<TData, unknown>): string {
  switch (column.columnDef.meta?.align) {
    case 'center':
      return 'text-center'
    case 'end':
      return 'text-end'
    default:
      return 'text-start'
  }
}

function getColumnWidth(column: Column<TData, unknown>): string | undefined {
  return column.columnDef.meta?.width
}

function getSelectFilterOptions(
  column: Column<TData, unknown>,
): { label: string; value: string | number }[] {
  const metaOptions = column.columnDef.meta?.filter?.options ?? []

  return metaOptions.map((option) => ({
    label: option.label,
    value: encodeFilterOptionValue(option.value),
  }))
}

function encodeFilterOptionValue(value: DataTableFilterOption['value']): string | number {
  return typeof value === 'boolean' ? String(value) : value
}

function decodeFilterOptionValue(
  column: Column<TData, unknown>,
  value: string | number,
): DataTableFilterOption['value'] {
  const metaOptions = column.columnDef.meta?.filter?.options ?? []
  const matchedOption = metaOptions.find(
    (option) => encodeFilterOptionValue(option.value) === value,
  )

  if (matchedOption) return matchedOption.value
  if (column.columnDef.meta?.filter?.variant === 'boolean') return value === 'true'

  return value
}

function getFilterControlValue(column: Column<TData, unknown>): string | number | undefined {
  const value = column.getFilterValue()

  if (value === undefined || value === null || value === '') return undefined
  return encodeFilterOptionValue(value as DataTableFilterOption['value'])
}

function getTextFilterValue(column: Column<TData, unknown>): string {
  const value = column.getFilterValue()

  if (value === undefined || value === null) return ''
  return String(value)
}

function setTextFilterValue(column: Column<TData, unknown>, value: string): void {
  column.setFilterValue(value.trim() ? value : undefined)
}

function onTextFilterInput(column: Column<TData, unknown>, event: Event): void {
  setTextFilterValue(column, (event.target as HTMLInputElement).value)
}

function setSelectFilterValue(
  column: Column<TData, unknown>,
  value: string | number | undefined,
): void {
  if (value === undefined || value === '') {
    column.setFilterValue(undefined)
    return
  }

  column.setFilterValue(decodeFilterOptionValue(column, value))
}

function clearColumnFilter(column: Column<TData, unknown>): void {
  column.setFilterValue(undefined)
}

function clearFilterChip(key: string): void {
  if (key === 'global') {
    globalSearch.value = ''
    return
  }

  props.table.getColumn(key)?.setFilterValue(undefined)
}

function clearAllFilters(): void {
  globalSearch.value = ''
  props.table.resetColumnFilters()
}

function formatFilterValue(column: Column<TData, unknown>, value: unknown): string {
  const metaOptions = column.columnDef.meta?.filter?.options ?? []
  const matchedOption = metaOptions.find((option) => option.value === value)

  if (matchedOption) return matchedOption.label
  if (typeof value === 'boolean') return value ? t('common_yes') : t('common_no')

  return String(value)
}

function toggleColumnVisibility(
  column: Column<TData, unknown>,
  value: boolean | 'indeterminate',
): void {
  column.toggleVisibility(Boolean(value))
}

function updatePageSize(value: string | number | Array<string | number>): void {
  const nextValue = Array.isArray(value) ? value[0] : value

  props.table.setPageSize(Number(nextValue))
  props.table.setPageIndex(0)
}

function getRowSelectionState(row: Row<TData>): boolean {
  return row.getIsSelected()
}

function toggleAllPageRows(value: boolean | 'indeterminate'): void {
  props.table.toggleAllPageRowsSelected(value === true)
}

function toggleRowSelection(row: Row<TData>, value: boolean | 'indeterminate'): void {
  row.toggleSelected(value === true)
}

function shouldShowExpandedDetail(row: Row<TData>): boolean {
  return hasExpandedRowSlot.value && row.getIsExpanded()
}

function getRowClasses(row: Row<TData>): string[] {
  return [
    'transition-colors',
    row.getIsSelected()
      ? 'bg-primary-50/80 dark:bg-primary-950/30'
      : 'odd:bg-white even:bg-surface-50/70 dark:odd:bg-surface-900 dark:even:bg-surface-800/60',
  ]
}
</script>

<template>
  <div
    class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 overflow-hidden rounded-2xl border bg-white shadow-(--shadow-soft)"
    data-ui="data-grid"
    data-provider="reka"
  >
    <div
      v-if="showToolbar"
      class="border-surface-200 dark:border-surface-700 flex flex-col gap-4 border-b px-4 py-4 lg:px-5"
    >
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex flex-1 flex-col gap-3 lg:max-w-2xl">
          <div v-if="showSearch" class="relative w-full lg:max-w-md">
            <span
              :class="[
                resolveIcon('search'),
                'text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2',
              ]"
            />
            <input
              v-model="globalSearch"
              :class="[baseTextInputClass, 'ps-10 pe-10']"
              type="search"
              :placeholder="resolvedSearchPlaceholder"
              :aria-label="resolvedSearchPlaceholder"
              data-ui="data-grid-search"
            />
            <button
              v-if="globalSearch"
              type="button"
              class="text-muted-foreground hover:text-surface-600 dark:hover:text-surface-300 absolute top-1/2 right-3 -translate-y-1/2"
              :aria-label="t('common_clear_search')"
              data-ui="data-grid-clear-search"
              @click="globalSearch = ''"
            >
              <span :class="[resolveIcon('close'), 'h-4 w-4']" />
            </button>
          </div>

          <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-2">
            <UiBadge v-for="filter in activeFilters" :key="filter.key" size="md" variant="primary">
              <span class="font-semibold">{{ filter.label }}:</span>
              <span>{{ filter.value }}</span>
              <button
                type="button"
                class="hover:text-primary-100 inline-flex items-center"
                :aria-label="`Clear ${filter.label} filter`"
                @click="clearFilterChip(filter.key)"
              >
                <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
              </button>
            </UiBadge>

            <UiButton size="xs" variant="ghost" @click="clearAllFilters">
              {{ t('common_clear_filters') }}
            </UiButton>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 lg:justify-end">
          <UiBadge v-if="selectedCount" variant="secondary">
            {{ selectedCount }} {{ t('common_selected') }}
          </UiBadge>
          <UiBadge variant="default"> {{ effectiveTotalRows }} {{ t('common_total') }} </UiBadge>

          <UiPopover v-if="showColumnVisibility && columnVisibilityColumns.length">
            <template #trigger>
              <button
                type="button"
                class="shaped-border shaped-radius-sm border-surface-300 hover:border-surface-400 hover:bg-surface-50 dark:border-surface-600 dark:hover:border-surface-500 dark:hover:bg-surface-800 text-foreground inline-flex min-h-10 items-center gap-2 border px-3 text-sm font-medium transition-colors"
                :aria-label="t('common_columns')"
                data-ui="data-grid-columns-button"
              >
                <span :class="[resolveIcon('tuning'), 'h-4 w-4']" />
                {{ t('common_columns') }}
              </button>
            </template>

            <div class="space-y-3">
              <div>
                <h3 class="text-foreground text-sm font-semibold">
                  {{ t('common_visible_columns') }}
                </h3>
              </div>

              <div class="space-y-2">
                <UiCheckbox
                  v-for="column in columnVisibilityColumns"
                  :key="column.id"
                  :label="getColumnLabel(column)"
                  :model-value="column.getIsVisible()"
                  @update:model-value="toggleColumnVisibility(column, $event)"
                />
              </div>
            </div>
          </UiPopover>
        </div>
      </div>
    </div>

    <div v-if="virtualSupported" class="overflow-hidden">
      <div class="border-surface-200 dark:border-surface-700 overflow-x-auto border-b">
        <div
          class="bg-surface-100/90 dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 grid min-w-full border-b text-sm"
          :style="{ gridTemplateColumns: virtualGridTemplateColumns }"
          role="row"
        >
          <div
            v-if="selectable"
            class="border-surface-200 dark:border-surface-700 flex items-center justify-center px-3 py-3"
            role="columnheader"
            data-ui="data-grid-select-all"
          >
            <UiCheckbox
              size="sm"
              checked-icon="checks"
              :aria-label="t('common_select_all_rows')"
              :model-value="selectAllState"
              @update:model-value="toggleAllPageRows"
            />
          </div>

          <div
            v-for="header in headerGroups[0]?.headers ?? []"
            :key="header.id"
            class="border-surface-200 dark:border-surface-700 flex items-center gap-2 border-r px-3 py-3 last:border-e-0"
            :class="getHeaderTextAlignClass(header.column)"
            role="columnheader"
          >
            <button
              v-if="header.column.getCanSort()"
              type="button"
              class="hover:text-primary-600 dark:hover:text-primary-300 text-foreground flex min-w-0 flex-1 items-center gap-2 text-start font-semibold transition-colors"
              data-ui="data-grid-sort"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <span class="truncate">
                <FlexRender
                  v-if="!header.isPlaceholder"
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
              </span>
              <span
                v-if="header.column.getIsSorted() === 'asc'"
                :class="[resolveIcon('arrow-up'), 'text-primary-500 h-3.5 w-3.5 shrink-0']"
              />
              <span
                v-else-if="header.column.getIsSorted() === 'desc'"
                :class="[resolveIcon('arrow-down'), 'text-primary-500 h-3.5 w-3.5 shrink-0']"
              />
            </button>

            <div v-else class="text-foreground min-w-0 flex-1 font-semibold">
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </div>

            <UiPopover v-if="showColumnFilters && hasFilter(header.column)">
              <template #trigger>
                <button
                  type="button"
                  class="border-surface-300 hover:border-surface-400 dark:border-surface-600 dark:hover:border-surface-500 inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
                  :class="
                    isFilterActive(header.column)
                      ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300'
                      : 'text-muted-foreground'
                  "
                  :aria-label="`${t('common_filter')} ${getColumnLabel(header.column)}`"
                  data-ui="data-grid-filter-button"
                >
                  <span :class="[resolveIcon('tuning'), 'h-3.5 w-3.5']" />
                </button>
              </template>

              <div class="space-y-3">
                <h3 class="text-foreground text-sm font-semibold">
                  {{ getColumnLabel(header.column) }}
                </h3>

                <input
                  v-if="header.column.columnDef.meta?.filter?.variant === 'text'"
                  :class="baseTextInputClass"
                  type="text"
                  :value="getTextFilterValue(header.column)"
                  :placeholder="
                    header.column.columnDef.meta?.filter?.placeholder ??
                    `${t('common_filter')} ${getColumnLabel(header.column)}`
                  "
                  :aria-label="`${t('common_filter')} ${getColumnLabel(header.column)}`"
                  @input="onTextFilterInput(header.column, $event)"
                />

                <UiSelect
                  v-else
                  :model-value="getFilterControlValue(header.column)"
                  :options="
                    header.column.columnDef.meta?.filter?.variant === 'boolean'
                      ? [
                          { label: t('common_yes'), value: 'true' },
                          { label: t('common_no'), value: 'false' },
                        ]
                      : getSelectFilterOptions(header.column)
                  "
                  :placeholder="
                    header.column.columnDef.meta?.filter?.placeholder ?? t('common_select')
                  "
                  @update:model-value="
                    setSelectFilterValue(header.column, Array.isArray($event) ? $event[0] : $event)
                  "
                />

                <UiButton size="xs" variant="ghost" @click="clearColumnFilter(header.column)">
                  {{ t('common_clear') }}
                </UiButton>
              </div>
            </UiPopover>
          </div>
        </div>
      </div>

      <div
        v-bind="containerProps"
        class="overflow-auto"
        :style="[
          (containerProps.style as Record<string, string>) ?? {},
          { maxHeight: normalizedMaxBodyHeight },
        ]"
        data-ui="data-grid-virtual-body"
      >
        <div v-bind="wrapperProps">
          <div
            v-for="virtualRow in virtualRows"
            :key="virtualRow.data.id"
            class="border-surface-100 dark:border-surface-800 grid min-w-full border-b text-sm"
            :class="getRowClasses(virtualRow.data)"
            :style="{
              gridTemplateColumns: virtualGridTemplateColumns,
              height: `${virtualRowHeight}px`,
            }"
            :data-row-id="virtualRow.data.id"
            role="row"
          >
            <div
              v-if="selectable"
              class="border-surface-100 dark:border-surface-800 flex items-center justify-center px-3 py-3"
              role="cell"
              data-ui="data-grid-row-select"
            >
              <UiCheckbox
                size="sm"
                :aria-label="t('common_select_row')"
                :disabled="!virtualRow.data.getCanSelect()"
                :model-value="getRowSelectionState(virtualRow.data)"
                @update:model-value="toggleRowSelection(virtualRow.data, $event)"
              />
            </div>

            <div
              v-for="cell in virtualRow.data.getVisibleCells()"
              :key="cell.id"
              class="border-surface-100 dark:border-surface-800 flex min-w-0 items-center border-r px-3 last:border-e-0"
              :class="getCellTextAlignClass(cell.column)"
              role="cell"
            >
              <div class="min-w-0 flex-1 truncate">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="overflow-auto" :style="{ maxHeight: normalizedMaxBodyHeight }">
      <table class="min-w-full border-collapse text-sm" :aria-label="ariaLabel">
        <thead class="bg-surface-100/90 dark:bg-surface-800/90 sticky top-0 z-10">
          <tr v-for="(headerGroup, headerIndex) in headerGroups" :key="headerGroup.id">
            <th
              v-if="expandable && headerIndex === 0"
              :rowspan="headerGroups.length"
              class="border-surface-200 dark:border-surface-700 w-12 border-b px-3 py-3"
              scope="col"
            />
            <th
              v-if="selectable && headerIndex === 0"
              :rowspan="headerGroups.length"
              class="border-surface-200 dark:border-surface-700 w-12 border-b px-3 py-3"
              scope="col"
            >
              <div class="flex items-center justify-center" data-ui="data-grid-select-all">
                <UiCheckbox
                  size="sm"
                  checked-icon="checks"
                  :aria-label="t('common_select_all_rows')"
                  :model-value="selectAllState"
                  @update:model-value="toggleAllPageRows"
                />
              </div>
            </th>

            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :colspan="header.colSpan"
              :style="{ width: getColumnWidth(header.column) ?? `${header.getSize()}px` }"
              class="border-surface-200 dark:border-surface-700 border-b px-3 py-3 align-middle"
              :class="getHeaderTextAlignClass(header.column)"
              scope="col"
            >
              <div v-if="!header.isPlaceholder" class="flex items-center gap-2">
                <button
                  v-if="header.column.getCanSort()"
                  type="button"
                  class="hover:text-primary-600 dark:hover:text-primary-300 text-foreground flex min-w-0 flex-1 items-center gap-2 text-start font-semibold transition-colors"
                  data-ui="data-grid-sort"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  <span class="truncate">
                    <FlexRender
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                  </span>
                  <span
                    v-if="header.column.getIsSorted() === 'asc'"
                    :class="[resolveIcon('arrow-up'), 'text-primary-500 h-3.5 w-3.5 shrink-0']"
                  />
                  <span
                    v-else-if="header.column.getIsSorted() === 'desc'"
                    :class="[resolveIcon('arrow-down'), 'text-primary-500 h-3.5 w-3.5 shrink-0']"
                  />
                </button>

                <div v-else class="text-foreground min-w-0 flex-1 font-semibold">
                  <FlexRender
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                </div>

                <UiPopover v-if="showColumnFilters && hasFilter(header.column)">
                  <template #trigger>
                    <button
                      type="button"
                      class="border-surface-300 hover:border-surface-400 dark:border-surface-600 dark:hover:border-surface-500 inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
                      :class="
                        isFilterActive(header.column)
                          ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300'
                          : 'text-muted-foreground'
                      "
                      :aria-label="`${t('common_filter')} ${getColumnLabel(header.column)}`"
                      data-ui="data-grid-filter-button"
                    >
                      <span :class="[resolveIcon('tuning'), 'h-3.5 w-3.5']" />
                    </button>
                  </template>

                  <div class="space-y-3">
                    <h3 class="text-foreground text-sm font-semibold">
                      {{ getColumnLabel(header.column) }}
                    </h3>

                    <input
                      v-if="header.column.columnDef.meta?.filter?.variant === 'text'"
                      :class="baseTextInputClass"
                      type="text"
                      :value="getTextFilterValue(header.column)"
                      :placeholder="
                        header.column.columnDef.meta?.filter?.placeholder ??
                        `${t('common_filter')} ${getColumnLabel(header.column)}`
                      "
                      :aria-label="`${t('common_filter')} ${getColumnLabel(header.column)}`"
                      @input="onTextFilterInput(header.column, $event)"
                    />

                    <UiSelect
                      v-else
                      :model-value="getFilterControlValue(header.column)"
                      :options="
                        header.column.columnDef.meta?.filter?.variant === 'boolean'
                          ? [
                              { label: t('common_yes'), value: 'true' },
                              { label: t('common_no'), value: 'false' },
                            ]
                          : getSelectFilterOptions(header.column)
                      "
                      :placeholder="
                        header.column.columnDef.meta?.filter?.placeholder ?? t('common_select')
                      "
                      @update:model-value="
                        setSelectFilterValue(
                          header.column,
                          Array.isArray($event) ? $event[0] : $event,
                        )
                      "
                    />

                    <UiButton size="xs" variant="ghost" @click="clearColumnFilter(header.column)">
                      {{ t('common_clear') }}
                    </UiButton>
                  </div>
                </UiPopover>
              </div>
            </th>
          </tr>
        </thead>

        <tbody v-if="!loading && bodyRows.length">
          <template v-for="row in bodyRows" :key="row.id">
            <tr :class="getRowClasses(row)" :data-row-id="row.id">
              <td
                v-if="expandable"
                class="border-surface-100 dark:border-surface-800 border-b px-3 py-2 align-middle"
              >
                <div
                  class="flex min-h-9 items-center"
                  :style="{ paddingInlineStart: `${row.depth * 0.875}rem` }"
                >
                  <button
                    v-if="row.getCanExpand()"
                    type="button"
                    class="text-surface-500 hover:text-surface-800 dark:hover:text-surface-100 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                    :aria-label="
                      row.getIsExpanded() ? t('common_collapse_row') : t('common_expand_row')
                    "
                    data-ui="data-grid-expander"
                    @click="row.toggleExpanded()"
                  >
                    <span
                      :class="[
                        row.getIsExpanded()
                          ? resolveIcon('chevron-down')
                          : resolveIcon('chevron-right'),
                        'h-4 w-4',
                      ]"
                    />
                  </button>
                </div>
              </td>

              <td
                v-if="selectable"
                class="border-surface-100 dark:border-surface-800 w-12 border-b px-3 py-3 align-middle"
              >
                <div class="flex items-center justify-center" data-ui="data-grid-row-select">
                  <UiCheckbox
                    size="sm"
                    :aria-label="t('common_select_row')"
                    :disabled="!row.getCanSelect()"
                    :model-value="getRowSelectionState(row)"
                    @update:model-value="toggleRowSelection(row, $event)"
                  />
                </div>
              </td>

              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="border-surface-100 dark:border-surface-800 border-b px-3 py-2 align-middle"
                :class="getCellTextAlignClass(cell.column)"
                :style="{ width: getColumnWidth(cell.column) ?? `${cell.column.getSize()}px` }"
              >
                <div class="min-w-0">
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </div>
              </td>
            </tr>

            <tr
              v-if="shouldShowExpandedDetail(row)"
              class="bg-surface-50/90 dark:bg-surface-950/40"
            >
              <td
                :colspan="totalColumnCount"
                class="border-surface-100 dark:border-surface-800 border-b px-4 py-4"
              >
                <slot name="expanded-row" :row="row" />
              </td>
            </tr>
          </template>
        </tbody>

        <tbody v-else>
          <tr>
            <td :colspan="totalColumnCount" class="px-4 py-10 text-center">
              <div class="text-muted-foreground mx-auto max-w-sm space-y-2">
                <span
                  :class="[
                    loading ? resolveIcon('spinner') : resolveIcon('document'),
                    loading ? 'animate-spin' : '',
                    'mx-auto block h-8 w-8',
                  ]"
                />
                <p class="text-foreground text-sm font-medium">
                  {{ loading ? resolvedLoadingText : resolvedEmptyText }}
                </p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showFooter"
      class="border-surface-200 dark:border-surface-700 flex flex-col gap-3 border-t px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"
    >
      <div class="text-muted-foreground text-sm">
        {{
          t('common_showing_rows', {
            start: pageRangeStart,
            end: pageRangeEnd,
            total: effectiveTotalRows,
          })
        }}
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div v-if="showPagination" class="sm:w-40">
          <!--
            `aria-label`, not just `placeholder`. A Reka select trigger is a
            <button role="combobox"> whose content is the selected value — "10"
            — so the placeholder never becomes its accessible name and axe
            reports a critical `button-name` violation on every page with a
            grid. The label has to be stated explicitly.
          -->
          <UiSelect
            :model-value="paginationState.pageSize"
            :options="pageSizeOptions"
            :placeholder="t('common_rows_per_page')"
            :aria-label="t('common_rows_per_page')"
            @update:model-value="updatePageSize"
          />
        </div>

        <div v-if="showPagination" class="flex items-center gap-2">
          <UiButton
            size="sm"
            variant="ghost"
            :disabled="!table.getCanPreviousPage()"
            data-ui="data-grid-prev-page"
            @click="table.previousPage()"
          >
            {{ t('common_previous') }}
          </UiButton>
          <div class="text-muted-foreground min-w-28 text-center text-sm font-medium">
            {{ t('common_page_of', { current: currentPage, total: pageCount }) }}
          </div>
          <UiButton
            size="sm"
            variant="ghost"
            :disabled="!table.getCanNextPage()"
            data-ui="data-grid-next-page"
            @click="table.nextPage()"
          >
            {{ t('common_next') }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
