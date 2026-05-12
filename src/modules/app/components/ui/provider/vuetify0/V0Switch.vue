<script setup lang="ts">
import type { SwitchProps } from '@/components/ui/base'
import BaseSwitchField from '@/components/ui/base/BaseSwitchField.vue'

defineProps<SwitchProps>()
</script>

<template>
  <BaseSwitchField v-bind="$props" provider="vuetify0" />
</template>
