<script setup lang="ts">
import type { TagsFieldProps } from '@/components/ui/base'
import BaseTagsFieldInput from '@/components/ui/base/BaseTagsFieldInput.vue'

defineProps<TagsFieldProps>()
</script>

<template>
  <BaseTagsFieldInput v-bind="$props" provider="reka" />
</template>
