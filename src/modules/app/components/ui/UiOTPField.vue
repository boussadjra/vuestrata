<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiOTPField = resolveUiComponent('OTPField')
</script>

<template>
  <component :is="UiOTPField" v-bind="$props">
    <slot />
  </component>
</template>
