<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiFormGroup = resolveUiComponent('FormGroup')
</script>

<template>
  <component :is="UiFormGroup" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </component>
</template>
