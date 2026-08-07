<script setup lang="ts">
import { useFormRepeater } from '@formwerk/core'
import { useI18n } from 'vue-i18n'

import type { FormRepeaterProps } from '~/types/forms'

const props = defineProps<FormRepeaterProps>()
const { t } = useI18n()

const addButtonLabel = computed(() => props.addButtonLabel ?? t('common_add_item'))
const removeButtonLabel = computed(() => props.removeButtonLabel ?? t('common_remove'))

const { items, add, addButtonProps, Iteration } = useFormRepeater({
  name: () => props.name,
  min: () => props.min,
  max: () => props.max,
  addButtonLabel: () => addButtonLabel.value,
  removeButtonLabel: () => removeButtonLabel.value,
})
</script>

<template>
  <div class="flex flex-col gap-3" data-provider="reka">
    <component :is="Iteration" v-for="(key, index) in items" :key="key" :index="index">
      <template #default="{ removeButtonProps, moveUpButtonProps, moveDownButtonProps }">
        <div class="flex items-start gap-2">
          <div class="flex-1">
            <slot
              :index="index"
              :key="key"
              :remove="removeButtonProps.onClick"
              :move-up="moveUpButtonProps.onClick"
              :move-down="moveDownButtonProps.onClick"
              :remove-button-props="removeButtonProps"
              :move-up-button-props="moveUpButtonProps"
              :move-down-button-props="moveDownButtonProps"
            />
          </div>
          <button
            v-bind="removeButtonProps"
            type="button"
            class="text-destructive hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-900/20 mt-1 rounded-md px-2 py-1 text-xs transition-colors"
          >
            {{ removeButtonLabel }}
          </button>
        </div>
      </template>
    </component>

    <slot name="add" :add="() => add()" :add-button-props="addButtonProps">
      <button
        v-bind="addButtonProps"
        type="button"
        class="border-surface-300 dark:border-surface-600 text-muted-foreground hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400 self-start rounded-md border border-dashed px-3 py-1.5 text-sm transition-colors"
        @click="add()"
      >
        {{ addButtonLabel }}
      </button>
    </slot>
  </div>
</template>
