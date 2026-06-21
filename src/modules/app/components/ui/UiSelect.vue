<script setup lang="ts">
import type { SelectProps } from '@/components/ui/base'
import BaseSelectField from '@/components/ui/base/BaseSelectField.vue'

import RekaOption from './UiOption.vue'
import RekaOptionGroup from './UiOptionGroup.vue'

defineProps<SelectProps>()

defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <BaseSelectField
    v-bind="{ ...$props, ...$attrs }"
    provider="reka"
    :option-component="RekaOption"
    :option-group-component="RekaOptionGroup"
  />
</template>
