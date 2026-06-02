<script setup lang="ts">
import type { SelectProps } from '@/components/ui/base'
import BaseSelectField from '@/components/ui/base/BaseSelectField.vue'

import V0Option from './V0Option.vue'
import V0OptionGroup from './V0OptionGroup.vue'

defineProps<SelectProps>()

defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <BaseSelectField
    v-bind="{ ...$props, ...$attrs }"
    provider="vuetify0"
    :option-component="V0Option"
    :option-group-component="V0OptionGroup"
  />
</template>
