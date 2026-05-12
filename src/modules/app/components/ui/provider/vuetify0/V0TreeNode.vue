<script setup lang="ts">
import type { TreeNode } from '@/components/ui/base'
import BaseTreeNode from '@/components/ui/base/BaseTreeNode.vue'

defineProps<{
  node: TreeNode
  level: number
  isExpanded: (value: string) => boolean
  isSelected: (value: string) => boolean
  toggleExpand: (value: string) => void
  selectNode: (value: string) => void
}>()
</script>

<template>
  <BaseTreeNode v-bind="$props" provider="vuetify0" />
</template>
