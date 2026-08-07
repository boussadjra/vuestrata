<script setup lang="ts">
/**
 * Product catalogue — the card-grid pattern.
 *
 * A grid rather than a table because the useful unit here is the product, not a
 * row of comparable figures: the description matters, and it does not fit in a
 * column. The grid is still a real list (`<ul>`/`<li>`), so a screen reader
 * announces how many products there are and where in them the user is.
 */
import { useI18n } from 'vue-i18n'

import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSearchField,
  UiSelect,
  UiSkeleton,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'

import { useProductsQuery } from '../composables/useCatalog'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  stockLevelOf,
  type Product,
  type ProductCategory,
  type ProductFilters,
  type ProductStatus,
  type StockLevel,
} from '../types'

const { t } = useI18n()
const { can } = useRbac()
const { currency, number } = useFormatters()

const search = ref('')
// Typed as the union plus `'all'` rather than plain `string`, so a typo in a
// filter option is a compile error instead of a query that silently matches
// nothing.
const category = ref<ProductCategory | 'all'>('all')
const status = ref<ProductStatus | 'all'>('all')
const page = ref(1)

// Debounced so typing does not fire a request per keystroke; the page resets to
// 1 whenever a filter changes, or the user lands on an empty page 4 of 2.
const debouncedSearch = refDebounced(search, 300)
watch([debouncedSearch, category, status], () => {
  page.value = 1
})

const filters = computed<ProductFilters>(() => ({
  page: page.value,
  pageSize: 12,
  search: debouncedSearch.value || undefined,
  category: category.value,
  status: status.value,
  sortBy: 'name',
  sortOrder: 'asc' as const,
}))

const { items, meta, isPending, isFetching, isError, refetch } = useProductsQuery(filters)

const categoryOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...PRODUCT_CATEGORIES.map((value) => ({ label: t(`catalog_category_${value}`), value })),
])
const statusOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...PRODUCT_STATUSES.map((value) => ({ label: t(`catalog_status_${value}`), value })),
])

/**
 * Stock is communicated by a worded badge, not by colour.
 * "Not stocked" and "Out of stock" are deliberately different: one is a
 * property of the product, the other a temporary condition to act on.
 */
const STOCK_VARIANT: Record<StockLevel, 'success' | 'warning' | 'error' | 'default'> = {
  ok: 'success',
  low: 'warning',
  out: 'error',
  'not-stocked': 'default',
}

function stockLabel(product: Product): string {
  const level = stockLevelOf(product)
  if (level === 'not-stocked') return t('catalog_stock_not_stocked')
  if (level === 'out') return t('catalog_stock_out')
  return t(`catalog_stock_${level}`, { count: number(product.stock ?? 0) })
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('catalog_title')" :description="t('catalog_subtitle')">
      <template #actions>
        <UiSearchField
          v-model="search"
          class="min-w-56"
          :placeholder="t('catalog_search_placeholder')"
          :aria-label="t('catalog_search_placeholder')"
        />
        <UiSelect
          v-model="category"
          class="min-w-40"
          :options="categoryOptions"
          :aria-label="t('catalog_filter_category')"
        />
        <UiSelect
          v-model="status"
          class="min-w-40"
          :options="statusOptions"
          :aria-label="t('catalog_filter_status')"
        />
        <UiButton v-if="can('catalog:manage')" to="/dashboard/products/new" variant="primary">
          <span :class="[resolveIcon('document-add'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('catalog_new') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div
      v-else-if="isPending"
      class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      :aria-label="t('common_loading')"
    >
      <UiSkeleton v-for="index in 6" :key="index" class="h-44" />
    </div>

    <UiEmptyState
      v-else-if="items.length === 0"
      icon="search"
      :title="t('catalog_empty_title')"
      :description="t('catalog_empty_body')"
    />

    <template v-else>
      <!--
        `aria-busy` while a filter change is in flight: the previous results
        stay on screen (placeholderData), so without it a screen reader would
        announce stale content as if it were the answer.
      -->
      <ul
        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        :aria-busy="isFetching"
        :aria-label="t('catalog_title')"
      >
        <li v-for="product in items" :key="product.id">
          <UiCard class="flex h-full flex-col p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-foreground truncate font-semibold">
                  <RouterLink
                    :to="`/dashboard/products/${product.id}`"
                    class="hover:text-link-hover hover:underline"
                  >
                    {{ product.name }}
                  </RouterLink>
                </h2>
                <p class="text-muted-foreground font-mono text-xs">{{ product.sku }}</p>
              </div>
              <UiBadge :variant="STOCK_VARIANT[stockLevelOf(product)]" size="sm">
                {{ stockLabel(product) }}
              </UiBadge>
            </div>

            <p class="text-muted-foreground mt-3 grow text-sm">{{ product.description }}</p>

            <div class="border-border mt-4 flex items-end justify-between border-t pt-3">
              <span class="text-muted-foreground text-xs">
                {{ t(`catalog_category_${product.category}`) }}
              </span>
              <span class="text-foreground text-lg font-semibold tabular-nums">
                {{ currency(product.price.amount, product.price.currency) }}
              </span>
            </div>
          </UiCard>
        </li>
      </ul>

      <!--
        A grid has no built-in pager, so this is a labelled nav with a live
        position readout rather than two bare arrows.
      -->
      <nav
        v-if="meta && meta.totalPages > 1"
        class="flex items-center justify-between"
        :aria-label="t('catalog_pagination_label')"
      >
        <UiButton variant="ghost" :disabled="page <= 1" @click="page -= 1">
          <span :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']" aria-hidden="true" />
          {{ t('common_previous') }}
        </UiButton>
        <p class="text-muted-foreground text-sm" aria-live="polite">
          {{ t('catalog_page_of', { page: meta.page, total: meta.totalPages }) }}
        </p>
        <UiButton variant="ghost" :disabled="page >= meta.totalPages" @click="page += 1">
          {{ t('common_next') }}
          <span
            :class="[resolveIcon('arrow-right'), 'h-4 w-4 rtl:rotate-180']"
            aria-hidden="true"
          />
        </UiButton>
      </nav>
    </template>
  </div>
</template>
