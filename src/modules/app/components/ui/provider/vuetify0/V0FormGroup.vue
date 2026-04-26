<script setup lang="ts">
import type { FormGroupProps } from '~/types/forms'

import BaseFormGroup from '../../base/BaseFormGroup.vue'

defineProps<FormGroupProps>()
</script>

<template>
  <BaseFormGroup v-bind="$props" data-provider="vuetify0">
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </BaseFormGroup>
</template>
