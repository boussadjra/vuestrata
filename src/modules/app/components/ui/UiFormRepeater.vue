<script setup lang="ts">
import type { FormRepeaterProps } from '~/types/forms'

import BaseFormRepeater from './base/BaseFormRepeater.vue'

const props = withDefaults(defineProps<FormRepeaterProps>(), {
  addButtonLabel: 'Add item',
  removeButtonLabel: 'Remove',
})
</script>

<template>
  <BaseFormRepeater v-bind="$props" data-provider="reka" class="flex flex-col gap-3">
    <template #default="{ index, key, removeButtonProps, moveUpButtonProps, moveDownButtonProps }">
      <div class="flex items-start gap-2">
        <div class="flex-1">
          <slot
            :index="index"
            :key="key"
            :remove="removeButtonProps.onClick"
            :move-up="moveUpButtonProps.onClick"
            :move-down="moveDownButtonProps.onClick"
          />
        </div>
        <button
          v-bind="removeButtonProps"
          type="button"
          class="mt-1 rounded-md px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          {{ removeButtonLabel }}
        </button>
      </div>
    </template>

    <template #add="{ add, addButtonProps }">
      <button
        v-bind="addButtonProps"
        type="button"
        class="border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-400 hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400 self-start rounded-md border border-dashed px-3 py-1.5 text-sm transition-colors"
        @click="add()"
      >
        {{ addButtonLabel }}
      </button>
    </template>
  </BaseFormRepeater>
</template>
