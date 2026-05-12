<script setup lang="ts">
import type { TextFieldProps } from '@/components/ui/base'
import BaseTextFieldInput from '@/components/ui/base/BaseTextFieldInput.vue'

defineProps<TextFieldProps>()
</script>

<template>
  <BaseTextFieldInput v-bind="$props" provider="vuetify0" />
</template>
