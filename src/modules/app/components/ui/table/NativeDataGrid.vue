<script setup lang="ts">
import type { TableColumn, TableRow } from '@vueye-table/core'
import {
  DataTableBody,
  DataTableCell,
  DataTableExpandToggle,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableHeaderRow,
  DataTableRoot,
  DataTableRow,
  DataTableViewport,
} from '@vueye-table/headless'
import { provideTableLocale, type AnyDataTableBinding } from '@vueye-table/vue'
import { useI18n } from 'vue-i18n'

import {
  TableCellContent,
  type DataTableColumnMeta,
  type DataTableFilterOption,
} from '@/composables/table-columns'
import { intlLocale } from '@/plugins/appearance'
import { resolveIcon } from '~/config/icon-provider'

import UiBadge from '../UiBadge.vue'
import UiButton from '../UiButton.vue'
import UiCheckbox from '../UiCheckbox.vue'
import UiEmptyState from '../UiEmptyState.vue'
import UiPopover from '../UiPopover.vue'
import UiSelect from '../UiSelect.vue'

type TData = unknown

const props = withDefaults(
  defineProps<{
    table: AnyDataTableBinding
    emptyText?: string
    loading?: boolean
    loadingText?: string
    ariaLabel?: string
    showToolbar?: boolean
    showSearch?: boolean
    searchPlaceholder?: string
    showColumnFilters?: boolean | null
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
    error?: boolean
    embedded?: boolean
    /** Server bindings do not expose their construction options. */
    manual?: boolean
  }>(),
  {
    loading: false,
    error: false,
    ariaLabel: 'Data grid',
    showToolbar: true,
    showSearch: true,
    showColumnFilters: null,
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
    embedded: false,
    manual: false,
  },
)

const emit = defineEmits<{ retry: [] }>()
const slots = useSlots()
const { t, locale } = useI18n()
const bindingVersion = ref(0)
watch(
  () => props.table,
  () => {
    bindingVersion.value += 1
  },
)

provideTableLocale(() => ({
  locale: intlLocale(locale.value),
  messages: {
    loading: t('common_loading'),
    loadingRows: t('common_loading'),
    loadingMoreRows: t('common_loading'),
    loadingChildren: t('common_loading'),
    childrenError: t('common_error_body'),
    retryChildren: t('common_retry'),
    expandRow: t('common_expand_row'),
    collapseRow: t('common_collapse_row'),
    selectAllRows: t('common_select_all_rows'),
    selectRow: () => t('common_select_row'),
  },
}))

const resolvedShowColumnFilters = computed(() => props.showColumnFilters ?? !props.manual)
const normalizedMaxBodyHeight = computed(() =>
  typeof props.maxBodyHeight === 'number' ? `${props.maxBodyHeight}px` : props.maxBodyHeight,
)
const virtualSupported = computed(
  () =>
    props.virtual &&
    !props.error &&
    !props.expandable &&
    !slots['expanded-row'] &&
    !props.table.tree,
)
const virtualOptions = computed(() =>
  virtualSupported.value ? { rowHeight: props.virtualRowHeight, initialCount: 12 } : false,
)
const totalColumnCount = computed(() =>
  Math.max(1, props.table.columns.length + Number(props.selectable) + Number(props.expandable)),
)
const effectiveTotalRows = computed(() => props.totalRows ?? props.table.rowCount)
const resolvedSearchPlaceholder = computed(() => props.searchPlaceholder ?? t('common_search'))
const globalSearch = computed({
  get: () => props.table.state.search,
  set: (value: string) => props.table.search(value),
})
const columnVisibilityColumns = computed(() =>
  props.table.allColumns.filter((column) => meta(column).hideable !== false),
)
const filterableColumns = computed(() =>
  props.table.allColumns.filter((column) => meta(column).filter),
)
const pageSizeOptions = computed(() =>
  props.pageSizeOptions.map((value) => ({ label: String(value), value })),
)
const selectAllState = computed<boolean | 'indeterminate'>(() =>
  props.table.pageSelection === 'all'
    ? true
    : props.table.pageSelection === 'some'
      ? 'indeterminate'
      : false,
)
const activeFilters = computed(() => [
  ...(globalSearch.value.trim()
    ? [{ key: 'search', label: t('common_search_label'), value: globalSearch.value.trim() }]
    : []),
  ...filterableColumns.value
    .filter(isFilterActive)
    .map((column) => ({ key: column.id, label: column.header, value: formatFilterValue(column) })),
])
const baseTextInputClass =
  'shaped-border shaped-radius-sm border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2'

function meta(column: TableColumn<TData>): DataTableColumnMeta<TData> {
  return column.meta as DataTableColumnMeta<TData>
}
function typedRow(row: TableRow<unknown>): TableRow<TData> {
  return row as TableRow<TData>
}
function alignClass(column: TableColumn<TData>): string {
  return column.align === 'end'
    ? 'text-end'
    : column.align === 'center'
      ? 'text-center'
      : 'text-start'
}
function sortColumn(column: TableColumn<TData>, event: MouseEvent) {
  props.table.toggleSort(column.id, { multi: event.shiftKey })
}
function isFilterActive(column: TableColumn<TData>): boolean {
  const value = props.table.state.filters[column.id]
  return value !== undefined && value !== null && value !== ''
}
function encodeFilterValue(value: DataTableFilterOption['value']): string | number {
  return typeof value === 'boolean' ? String(value) : value
}
function filterOptions(column: TableColumn<TData>) {
  return meta(column).filter?.variant === 'boolean'
    ? [
        { label: t('common_yes'), value: 'true' },
        { label: t('common_no'), value: 'false' },
      ]
    : (meta(column).filter?.options ?? []).map((option) => ({
        label: option.label,
        value: encodeFilterValue(option.value),
      }))
}
function filterControlValue(column: TableColumn<TData>): string | number | undefined {
  return isFilterActive(column)
    ? encodeFilterValue(props.table.state.filters[column.id] as DataTableFilterOption['value'])
    : undefined
}
function textFilterValue(column: TableColumn<TData>): string {
  return String(props.table.state.filters[column.id] ?? '')
}
function onTextFilterInput(column: TableColumn<TData>, event: Event) {
  props.table.filter(column.id, (event.target as HTMLInputElement).value || undefined)
}
function onChoiceFilter(
  column: TableColumn<TData>,
  input: string | number | Array<string | number>,
) {
  const value = Array.isArray(input) ? input[0] : input
  if (value === undefined || value === '') {
    props.table.filter(column.id, undefined)
    return
  }
  const choice = meta(column).filter?.options?.find(
    (option) => encodeFilterValue(option.value) === value,
  )
  props.table.filter(
    column.id,
    choice?.value ?? (meta(column).filter?.variant === 'boolean' ? value === 'true' : value),
  )
}
function formatFilterValue(column: TableColumn<TData>): string {
  const value = props.table.state.filters[column.id]
  const choice = meta(column).filter?.options?.find((option) => Object.is(option.value, value))
  return (
    choice?.label ??
    (typeof value === 'boolean' ? t(value ? 'common_yes' : 'common_no') : String(value))
  )
}
function clearFilter(key: string) {
  if (key === 'search') props.table.search('')
  else props.table.filter(key, undefined)
}
function clearAllFilters() {
  props.table.search('')
  props.table.clearFilters()
}
function updatePageSize(input: string | number | Array<string | number>) {
  props.table.setPageSize(Number(Array.isArray(input) ? input[0] : input))
}
function toggleAllPageRows(value: boolean | 'indeterminate') {
  const keys = props.table.rows.map((row) => row.key)
  if (value === true) props.table.select(keys)
  else props.table.deselect(keys)
}
function toggleRow(row: TableRow<unknown>, value: boolean | 'indeterminate') {
  props.table.toggleRow(row.key, value === true)
}
function toggleVisibility(column: TableColumn<TData>, value: boolean | 'indeterminate') {
  props.table.toggleColumn(column.id, value === true)
}
function retry() {
  emit('retry')
}
</script>

<template>
  <div
    class="overflow-hidden"
    :class="embedded ? 'bg-transparent' : 'border-border bg-card rounded-xl border'"
    data-ui="data-grid"
    data-provider="vueye"
    :data-embedded="embedded ? 'true' : undefined"
  >
    <div
      v-if="showToolbar"
      class="border-border flex flex-col gap-4 border-b"
      :class="embedded ? 'px-4 py-3' : 'px-4 py-4 lg:px-5'"
    >
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex flex-1 flex-col gap-3 lg:max-w-2xl">
          <div v-if="showSearch" class="relative w-full lg:max-w-md">
            <span
              :class="[
                resolveIcon('search'),
                'text-muted-foreground pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2',
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
              class="text-muted-foreground hover:text-foreground absolute end-3 top-1/2 -translate-y-1/2"
              :aria-label="t('common_clear_search')"
              data-ui="data-grid-clear-search"
              @click="globalSearch = ''"
            >
              <span :class="[resolveIcon('close'), 'h-4 w-4']" />
            </button>
          </div>
          <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-2">
            <UiBadge v-for="filter in activeFilters" :key="filter.key" size="md" variant="primary">
              <span class="font-semibold">{{ filter.label }}:</span><span>{{ filter.value }}</span>
              <button
                type="button"
                class="inline-flex items-center"
                :aria-label="`${t('common_clear')} ${filter.label}`"
                @click="clearFilter(filter.key)"
              >
                <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
              </button>
            </UiBadge>
            <UiButton size="xs" variant="ghost" @click="clearAllFilters">{{
              t('common_clear_filters')
            }}</UiButton>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 lg:justify-end">
          <UiBadge v-if="table.selectedCount" variant="secondary"
            >{{ table.selectedCount }} {{ t('common_selected') }}</UiBadge
          >
          <UiBadge variant="default">{{ effectiveTotalRows }} {{ t('common_total') }}</UiBadge>
          <UiPopover v-if="showColumnVisibility && columnVisibilityColumns.length">
            <template #trigger
              ><button
                type="button"
                class="shaped-border shaped-radius-sm border-border hover:bg-muted text-foreground inline-flex min-h-10 items-center gap-2 border px-3 text-sm font-medium"
                :aria-label="t('common_columns')"
                data-ui="data-grid-columns-button"
              >
                <span :class="[resolveIcon('tuning'), 'h-4 w-4']" />{{ t('common_columns') }}
              </button></template
            >
            <div class="space-y-3">
              <h3 class="text-foreground text-sm font-semibold">
                {{ t('common_visible_columns') }}
              </h3>
              <div class="space-y-2">
                <UiCheckbox
                  v-for="column in columnVisibilityColumns"
                  :key="column.id"
                  :label="column.header"
                  :model-value="!table.state.hiddenColumns.includes(column.id)"
                  @update:model-value="toggleVisibility(column, $event)"
                />
              </div>
            </div>
          </UiPopover>
        </div>
      </div>
    </div>

    <DataTableViewport
      :key="bindingVersion"
      :height="normalizedMaxBodyHeight"
      :style="virtualSupported ? undefined : { height: 'auto', maxHeight: normalizedMaxBodyHeight }"
      :data-ui="virtualSupported ? 'data-grid-virtual-body' : 'data-grid-body'"
    >
      <DataTableRoot
        :table="table"
        :virtual="virtualOptions"
        :leading-columns="Number(selectable) + Number(expandable)"
        class="min-w-full border-collapse text-sm"
        :aria-label="ariaLabel"
        :aria-busy="loading"
      >
        <DataTableHeader class="bg-muted sticky top-0 z-10" data-ui="data-grid-header">
          <DataTableHeaderRow>
            <th v-if="expandable" class="border-border w-12 border-b px-3 py-3" scope="col">
              <span class="sr-only">{{ t('common_expand_row') }}</span>
            </th>
            <th v-if="selectable" class="border-border w-12 border-b px-3 py-3" scope="col">
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
            <DataTableHeaderCell
              v-for="column in table.columns"
              :key="column.id"
              :column="column"
              class="border-border border-b px-3 py-3 align-middle"
              :class="alignClass(column)"
            >
              <div class="flex items-center gap-2">
                <button
                  v-if="column.sortable"
                  type="button"
                  class="text-foreground hover:text-primary focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 text-start font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  data-ui="data-grid-sort"
                  @click="sortColumn(column, $event)"
                >
                  <span class="truncate">{{ column.header }}</span
                  ><span
                    v-if="table.getSort(column.id)"
                    :class="[
                      resolveIcon(
                        table.getSort(column.id)?.direction === 'asc' ? 'arrow-up' : 'arrow-down',
                      ),
                      'text-primary h-3.5 w-3.5 shrink-0',
                    ]"
                  />
                </button>
                <div v-else class="text-foreground min-w-0 flex-1 font-semibold">
                  {{ column.header }}
                </div>
                <UiPopover v-if="resolvedShowColumnFilters && meta(column).filter">
                  <template #trigger
                    ><button
                      type="button"
                      class="border-border focus-visible:ring-ring inline-flex h-8 w-8 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none"
                      :class="
                        isFilterActive(column)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground'
                      "
                      :aria-label="`${t('common_filter')} ${column.header}`"
                      data-ui="data-grid-filter-button"
                    >
                      <span :class="[resolveIcon('tuning'), 'h-3.5 w-3.5']" /></button
                  ></template>
                  <div class="space-y-3">
                    <h3 class="text-foreground text-sm font-semibold">{{ column.header }}</h3>
                    <input
                      v-if="meta(column).filter?.variant === 'text'"
                      :class="baseTextInputClass"
                      type="text"
                      :value="textFilterValue(column)"
                      :placeholder="
                        meta(column).filter?.placeholder ?? `${t('common_filter')} ${column.header}`
                      "
                      :aria-label="`${t('common_filter')} ${column.header}`"
                      @input="onTextFilterInput(column, $event)"
                    />
                    <UiSelect
                      v-else
                      :model-value="filterControlValue(column)"
                      :options="filterOptions(column)"
                      :placeholder="meta(column).filter?.placeholder ?? t('common_select')"
                      :aria-label="`${t('common_filter')} ${column.header}`"
                      @update:model-value="onChoiceFilter(column, $event)"
                    />
                    <UiButton
                      size="xs"
                      variant="ghost"
                      @click="table.filter(column.id, undefined)"
                      >{{ t('common_clear') }}</UiButton
                    >
                  </div>
                </UiPopover>
              </div>
            </DataTableHeaderCell>
          </DataTableHeaderRow>
        </DataTableHeader>
        <tbody v-if="error">
          <tr>
            <td :colspan="totalColumnCount" class="px-4 py-6">
              <UiEmptyState
                variant="error"
                :title="t('common_error_title')"
                :description="t('common_error_body')"
                ><template #action
                  ><UiButton variant="ghost" data-ui="data-grid-retry" @click="retry">{{
                    t('common_retry')
                  }}</UiButton></template
                ></UiEmptyState
              >
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="loading || !table.rows.length">
          <tr>
            <td :colspan="totalColumnCount" class="px-4 py-10 text-center">
              <div class="text-muted-foreground mx-auto max-w-sm space-y-2">
                <span
                  :class="[
                    resolveIcon(loading ? 'spinner' : 'document'),
                    loading ? 'animate-spin' : '',
                    'mx-auto block h-8 w-8',
                  ]"
                />
                <p class="text-foreground text-sm font-medium">
                  {{
                    loading
                      ? (loadingText ?? t('common_loading'))
                      : (emptyText ?? t('common_no_results'))
                  }}
                </p>
              </div>
            </td>
          </tr>
        </tbody>
        <DataTableBody v-else :colspan="totalColumnCount">
          <template #row="{ row, rowIndex }">
            <DataTableRow
              :row="row"
              :row-index="rowIndex"
              :data-row-id="row.key"
              class="border-border border-b transition-colors"
              :class="table.isSelected(row.key) ? 'bg-primary/10' : 'odd:bg-card even:bg-muted/40'"
            >
              <td v-if="expandable" class="border-border border-b px-3 py-2">
                <div
                  class="flex min-h-9 items-center"
                  :style="{ paddingInlineStart: `${row.depth * 0.875}rem` }"
                >
                  <DataTableExpandToggle
                    :row="row"
                    class="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-full"
                    data-ui="data-grid-expander"
                    ><span
                      :class="[
                        resolveIcon(row.isExpanded ? 'chevron-down' : 'chevron-right'),
                        'h-4 w-4',
                      ]"
                  /></DataTableExpandToggle>
                </div>
              </td>
              <td v-if="selectable" class="border-border w-12 border-b px-3 py-3">
                <div class="flex items-center justify-center" data-ui="data-grid-row-select">
                  <UiCheckbox
                    size="sm"
                    :aria-label="t('common_select_row')"
                    :model-value="table.isSelected(row.key)"
                    :disabled="table.selectionMode === 'none'"
                    @update:model-value="toggleRow(row, $event)"
                  />
                </div>
              </td>
              <DataTableCell
                v-for="column in table.columns"
                :key="column.id"
                :row="row"
                :column="column"
                :tree="!expandable"
                class="border-border border-b px-3 py-2 align-middle"
                :class="alignClass(column)"
                :style="{ width: column.width ? `${column.width}px` : undefined }"
              >
                <slot
                  :name="`cell-${column.id}`"
                  :row="typedRow(row).original"
                  :value="row.getValue(column.id)"
                  :column="column"
                  :row-key="row.key"
                  ><TableCellContent :row="typedRow(row)" :column="column"
                /></slot>
              </DataTableCell>
            </DataTableRow>
          </template>
          <template v-if="slots['expanded-row']" #detail="{ row }"
            ><slot
              name="expanded-row"
              :row="typedRow(row).original"
              :row-key="row.key"
              :table-row="typedRow(row)"
          /></template>
        </DataTableBody>
      </DataTableRoot>
    </DataTableViewport>

    <div
      v-if="showFooter && !error"
      class="border-border flex flex-col gap-3 border-t px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"
    >
      <div class="text-muted-foreground text-sm">
        {{
          t('common_showing_rows', {
            start: table.pageStart,
            end: table.pageEnd,
            total: effectiveTotalRows,
          })
        }}
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div v-if="showPagination" class="sm:w-40">
          <UiSelect
            :model-value="table.pageSize"
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
            :disabled="!table.canPreviousPage"
            data-ui="data-grid-prev-page"
            @click="table.previousPage()"
            >{{ t('common_previous') }}</UiButton
          >
          <div class="text-muted-foreground min-w-28 text-center text-sm font-medium">
            {{ t('common_page_of', { current: table.page, total: table.pageCount }) }}
          </div>
          <UiButton
            size="sm"
            variant="ghost"
            :disabled="!table.canNextPage"
            data-ui="data-grid-next-page"
            @click="table.nextPage()"
            >{{ t('common_next') }}</UiButton
          >
        </div>
      </div>
    </div>
  </div>
</template>
