<script setup lang="ts">
import type { SelectProps } from '@/components/ui/base'
import BaseSelectField from '@/components/ui/base/BaseSelectField.vue'

import RekaOption from './RekaOption.vue'
import RekaOptionGroup from './RekaOptionGroup.vue'

defineProps<SelectProps>()
</script>

<template>
  <BaseSelectField
    v-bind="$props"
    provider="reka"
    :option-component="RekaOption"
    :option-group-component="RekaOptionGroup"
  />
</template>
