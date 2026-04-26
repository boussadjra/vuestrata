<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiFileUpload = resolveUiComponent('FileUpload')
</script>

<template>
  <component :is="UiFileUpload" v-bind="$attrs">
    <slot />
  </component>
</template>
