<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiFormRepeater = resolveUiComponent('FormRepeater')
</script>

<template>
  <component :is="UiFormRepeater" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </component>
</template>
