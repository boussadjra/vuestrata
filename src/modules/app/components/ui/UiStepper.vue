<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiStepper = resolveUiComponent('Stepper')
</script>

<template>
  <component :is="UiStepper" v-bind="$attrs">
    <slot />
  </component>
</template>
