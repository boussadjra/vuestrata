<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiMentionsField = resolveUiComponent('MentionsField')
</script>

<template>
  <component :is="UiMentionsField" v-bind="$props">
    <slot />
  </component>
</template>
