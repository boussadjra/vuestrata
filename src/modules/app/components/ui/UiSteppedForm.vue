<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSteppedForm = resolveUiComponent('SteppedForm')
</script>

<template>
  <component :is="UiSteppedForm" v-bind="$attrs">
    <slot />
  </component>
</template>
