<script setup lang="ts">
import type { FileUploadProps } from '@/components/ui/base'
import BaseFileUploadField from '@/components/ui/base/BaseFileUploadField.vue'

const props = withDefaults(defineProps<FileUploadProps>(), {
  multiple: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: File[]] }>()
</script>

<template>
  <BaseFileUploadField
    v-bind="props"
    provider="reka"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
