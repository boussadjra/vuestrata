<script setup lang="ts">
import type { TreeSelectProps } from '@/components/ui/base'
import BaseTreeSelectField from '@/components/ui/base/BaseTreeSelectField.vue'

import RekaTreeNode from './UiTreeNode.vue'

defineProps<TreeSelectProps>()
</script>

<template>
  <BaseTreeSelectField v-bind="$props" provider="reka" :tree-node-component="RekaTreeNode" />
</template>
