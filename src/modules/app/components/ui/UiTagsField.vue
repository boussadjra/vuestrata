<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTagsField = resolveUiComponent('TagsField')
</script>

<template>
  <component :is="UiTagsField" v-bind="$attrs">
    <slot />
  </component>
</template>
