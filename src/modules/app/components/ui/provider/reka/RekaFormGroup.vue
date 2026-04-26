<script setup lang="ts">
import type { FormGroupProps } from '~/types/forms'

import BaseFormGroup from '../../base/BaseFormGroup.vue'

defineProps<FormGroupProps>()
</script>

<template>
  <BaseFormGroup
    data-provider="reka"
    v-bind="$props"
    class="flex flex-col gap-3"
    legend-class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </BaseFormGroup>
</template>
