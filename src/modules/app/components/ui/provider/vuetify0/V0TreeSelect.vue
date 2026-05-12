<script setup lang="ts">
import type { TreeSelectProps } from '@/components/ui/base'
import BaseTreeSelectField from '@/components/ui/base/BaseTreeSelectField.vue'

import V0TreeNode from './V0TreeNode.vue'

defineProps<TreeSelectProps>()
</script>

<template>
  <BaseTreeSelectField v-bind="$props" provider="vuetify0" :tree-node-component="V0TreeNode" />
</template>
