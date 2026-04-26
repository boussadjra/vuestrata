<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiForm = resolveUiComponent('Form')
</script>

<template>
  <component :is="UiForm" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </component>
</template>
