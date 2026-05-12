<script setup lang="ts">
import type { OTPFieldProps } from '@/components/ui/base'
import BaseOTPFieldInput from '@/components/ui/base/BaseOTPFieldInput.vue'

defineProps<OTPFieldProps>()
</script>

<template>
  <BaseOTPFieldInput v-bind="$props" provider="vuetify0" />
</template>
