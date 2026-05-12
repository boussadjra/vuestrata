<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTabs = resolveUiComponent('Tabs')
</script>

<template>
  <component :is="UiTabs" v-bind="$props">
    <template v-for="(_, name) in $slots" :key="name" #[name]>
      <slot :name="name" />
    </template>
  </component>
</template>
