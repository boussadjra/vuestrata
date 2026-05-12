<script setup lang="ts">
import type { CheckboxProps } from '@/components/ui/base'
import BaseCheckboxField from '@/components/ui/base/BaseCheckboxField.vue'

defineProps<CheckboxProps>()
</script>

<template>
  <BaseCheckboxField v-bind="$props" provider="reka" />
</template>
