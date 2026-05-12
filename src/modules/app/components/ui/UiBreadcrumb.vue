<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiBreadcrumb = resolveUiComponent('Breadcrumb')
</script>

<template>
  <component :is="UiBreadcrumb" v-bind="$props" />
</template>
