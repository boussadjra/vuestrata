<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiButton from './UiButton.vue'
import UiEmptyState from './UiEmptyState.vue'
import UiSkeleton from './UiSkeleton.vue'

export interface PanelProps {
  title: string
  description?: string
  /** Request in flight with nothing to show yet. */
  loading?: boolean
  /** Request failed. Takes precedence over `empty`. */
  error?: boolean
  /** Request succeeded but returned nothing. */
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  /** Height reserved for the skeleton, so the layout does not jump on load. */
  contentClass?: string
}

const props = withDefaults(defineProps<PanelProps>(), {
  loading: false,
  error: false,
  empty: false,
  contentClass: 'min-h-48',
})

defineEmits<{ retry: [] }>()

const { t } = useI18n()
const headingId = useId()

/**
 * Exactly one state renders.
 *
 * Ordering matters: an errored request often also has no data, and showing
 * "no results" for a failed request tells the user something false — they would
 * conclude the data is empty rather than unknown.
 */
const state = computed(() => {
  if (props.error) return 'error'
  if (props.loading) return 'loading'
  if (props.empty) return 'empty'
  return 'ready'
})
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="border-border bg-card flex h-full flex-col rounded-[var(--shape-radius)] border shadow-(--shadow-card)"
  >
    <div class="border-border flex items-start justify-between gap-3 border-b p-4">
      <div class="min-w-0">
        <h2 :id="headingId" class="text-foreground text-base font-bold">{{ title }}</h2>
        <p v-if="description" class="text-muted-foreground mt-0.5 text-sm">{{ description }}</p>
      </div>
      <div class="shrink-0"><slot name="actions" /></div>
    </div>

    <div :class="['flex-1 p-4', contentClass]">
      <!--
        aria-busy tells assistive technology the region is updating, so a
        screen reader does not announce a skeleton as if it were content.
      -->
      <div v-if="state === 'loading'" :aria-busy="true" class="space-y-3">
        <slot name="skeleton">
          <UiSkeleton class="h-4 w-1/3" />
          <UiSkeleton class="h-32 w-full" />
        </slot>
      </div>

      <UiEmptyState
        v-else-if="state === 'error'"
        variant="error"
        size="sm"
        :title="t('common_error_title')"
        :description="t('common_error_body')"
      >
        <template #action>
          <UiButton variant="ghost" size="sm" @click="$emit('retry')">
            {{ t('common_retry') }}
          </UiButton>
        </template>
      </UiEmptyState>

      <UiEmptyState
        v-else-if="state === 'empty'"
        size="sm"
        :title="emptyTitle ?? t('common_no_data_title')"
        :description="emptyDescription ?? t('common_no_data_body')"
      >
        <template #action><slot name="empty-action" /></template>
      </UiEmptyState>

      <slot v-else />
    </div>
  </section>
</template>
