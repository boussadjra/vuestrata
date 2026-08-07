<script setup lang="ts">
/**
 * Product detail with inline editing.
 *
 * The edit form is on the record page rather than behind a separate route: a
 * product has few editable fields, and a round trip to `/edit` and back to see
 * the result costs more than it saves. Customers, with ten fields and a
 * multi-column layout, earns its own page — the pattern is chosen per domain,
 * not applied uniformly.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useI18n } from 'vue-i18n'

import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiForm,
  UiPageHeader,
  UiSelect,
  UiSkeleton,
  UiTextField,
  UiTextarea,
} from '@/components/ui'
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useFormatters } from '@/composables/useFormatters'
import { useRbac } from '@/composables/useRbac'
import { useRouteParam } from '@/composables/useRouteParam'
import { resolveIcon } from '@/config/icon-provider'
import { useNotificationStore } from '@/stores/notification'

import {
  useCreateProductMutation,
  useProductQuery,
  useUpdateProductMutation,
} from '../composables/useCatalog'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  productDraftSchema,
  stockLevelOf,
  type StockLevel,
} from '../types'

const { t } = useI18n()
const { can } = useRbac()
const { currency, dateTime, number } = useFormatters()
const router = useRouter()
const notifications = useNotificationStore()

const id = useRouteParam('id')
const isNew = computed(() => !id.value)

const { item: product, isPending, isError, error, refetch } = useProductQuery(id)

const createProduct = useCreateProductMutation()
const updateProduct = useUpdateProductMutation()

useBreadcrumbLabel(() => (isNew.value ? t('catalog_new') : (product.value?.name ?? null)))

const isNotFound = computed(() => {
  const failure = (error.value as { status?: number; statusCode?: number } | null) ?? null
  return failure?.status === 404 || failure?.statusCode === 404
})

const isSaving = computed(() => createProduct.isPending.value || updateProduct.isPending.value)
const saveError = computed(() => createProduct.error.value ?? updateProduct.error.value)

const schema = productDraftSchema as unknown as StandardSchemaV1

const initialValues = computed<Record<string, unknown> | undefined>(() => {
  if (isNew.value) {
    return { sku: '', name: '', description: '', category: 'hardware', status: 'draft' }
  }
  const record = product.value
  if (!record) return undefined
  return {
    sku: record.sku,
    name: record.name,
    description: record.description,
    category: record.category,
    status: record.status,
  }
})

const categoryOptions = computed(() =>
  PRODUCT_CATEGORIES.map((value) => ({ label: t(`catalog_category_${value}`), value })),
)
const statusOptions = computed(() =>
  PRODUCT_STATUSES.map((value) => ({ label: t(`catalog_status_${value}`), value })),
)

const STOCK_VARIANT: Record<StockLevel, 'success' | 'warning' | 'error' | 'default'> = {
  ok: 'success',
  low: 'warning',
  out: 'error',
  'not-stocked': 'default',
}

async function onSubmit(values: Record<string, unknown>) {
  const draft = productDraftSchema.parse(values)

  const saved = isNew.value
    ? await createProduct.mutateAsync(draft)
    : await updateProduct.mutateAsync({ id: id.value!, patch: draft })

  notifications.add({
    type: 'success',
    message: isNew.value ? t('catalog_created') : t('catalog_saved'),
  })
  if (isNew.value) await router.push(`/dashboard/products/${saved.id}`)
}
</script>

<template>
  <div class="space-y-6">
    <UiEmptyState
      v-if="isNotFound"
      variant="error"
      icon="search"
      :title="t('catalog_not_found_title')"
      :description="t('catalog_not_found_body')"
    >
      <UiButton to="/dashboard/products" variant="primary">{{
        t('catalog_back_to_list')
      }}</UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div
      v-else-if="!isNew && isPending"
      class="space-y-6"
      aria-busy="true"
      :aria-label="t('common_loading')"
    >
      <UiSkeleton class="h-10 w-64" />
      <UiSkeleton class="h-80" />
    </div>

    <template v-else>
      <UiPageHeader
        :title="isNew ? t('catalog_new_title') : (product?.name ?? '')"
        :description="isNew ? t('catalog_new_subtitle') : product?.sku"
      >
        <template v-if="product" #meta>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiBadge :variant="STOCK_VARIANT[stockLevelOf(product)]" size="sm">
              {{
                product.stock === null
                  ? t('catalog_stock_not_stocked')
                  : t('catalog_stock_units', { count: number(product.stock) })
              }}
            </UiBadge>
            <UiBadge variant="secondary" size="sm">
              {{ t(`catalog_status_${product.status}`) }}
            </UiBadge>
          </div>
        </template>
        <template #actions>
          <UiButton to="/dashboard/products" variant="ghost">
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
            {{ t('catalog_back_to_list') }}
          </UiButton>
        </template>
      </UiPageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <UiCard class="p-5 lg:col-span-2">
          <h2 class="text-foreground text-base font-semibold">
            {{ isNew ? t('catalog_new_title') : t('catalog_edit_title') }}
          </h2>

          <!--
            Read-only for anyone without `catalog:manage`. The fields are still
            shown — hiding the data a viewer is allowed to read would be a
            different, wrong, decision — but nothing is editable and no save
            button is offered.
          -->
          <p v-if="!can('catalog:manage')" class="text-muted-foreground mt-2 text-sm">
            {{ t('catalog_read_only') }}
          </p>

          <UiForm
            v-if="initialValues"
            :schema="schema"
            :initial-values="initialValues"
            :disabled="!can('catalog:manage')"
            class="mt-4"
            @submit="onSubmit"
          >
            <UiAlert v-if="saveError" variant="error" :title="t('common_error_title')">
              {{ saveError.message }}
            </UiAlert>

            <div class="grid gap-4 sm:grid-cols-2">
              <UiTextField name="sku" :label="t('catalog_sku')" required />
              <UiTextField name="name" :label="t('common_name')" required />
              <UiSelect name="category" :label="t('common_category')" :options="categoryOptions" />
              <UiSelect name="status" :label="t('common_status')" :options="statusOptions" />
            </div>
            <UiTextarea name="description" :label="t('common_description')" :rows="4" />

            <div v-if="can('catalog:manage')" class="flex justify-end pt-2">
              <UiButton type="submit" variant="primary" :loading="isSaving" :disabled="isSaving">
                {{ isNew ? t('catalog_create') : t('common_save') }}
              </UiButton>
            </div>
          </UiForm>
        </UiCard>

        <UiCard v-if="product" class="p-5">
          <h2 class="text-foreground text-base font-semibold">
            {{ t('catalog_inventory_title') }}
          </h2>
          <dl class="mt-4 space-y-4 text-sm">
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('common_price') }}
              </dt>
              <dd class="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {{ currency(product.price.amount, product.price.currency) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('catalog_on_hand') }}
              </dt>
              <!-- "Not stocked" is a property of the product; "0" is a
                   condition to act on. Collapsing them loses the difference. -->
              <dd class="text-foreground mt-1 tabular-nums">
                {{
                  product.stock === null ? t('catalog_stock_not_stocked') : number(product.stock)
                }}
              </dd>
            </div>
            <div v-if="product.stock !== null">
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('catalog_reorder_at') }}
              </dt>
              <dd class="text-foreground mt-1 tabular-nums">{{ number(product.reorderAt) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('common_updated_at') }}
              </dt>
              <dd class="text-foreground mt-1">
                <time :datetime="product.updatedAt">{{ dateTime(product.updatedAt) }}</time>
              </dd>
            </div>
          </dl>
        </UiCard>
      </div>
    </template>
  </div>
</template>
