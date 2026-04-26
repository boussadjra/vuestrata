<script setup lang="ts">
import type { FormProps } from '~/types/forms'

import BaseForm from '../../base/BaseForm.vue'

defineProps<FormProps>()
</script>

<template>
  <BaseForm v-bind="$props" data-provider="vuetify0">
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </BaseForm>
</template>
