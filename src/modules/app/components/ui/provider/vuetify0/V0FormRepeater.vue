<script setup lang="ts">
import type { FormRepeaterProps } from '~/types/forms'

import BaseFormRepeater from '../../base/BaseFormRepeater.vue'

defineProps<FormRepeaterProps>()
</script>

<template>
  <BaseFormRepeater v-bind="$props" data-provider="vuetify0">
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
    <template #add="addSlotProps">
      <slot name="add" v-bind="addSlotProps" />
    </template>
  </BaseFormRepeater>
</template>
