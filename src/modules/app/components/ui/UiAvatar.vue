<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiAvatar = resolveUiComponent('Avatar')
</script>

<template>
  <component :is="UiAvatar" v-bind="$props" />
</template>
