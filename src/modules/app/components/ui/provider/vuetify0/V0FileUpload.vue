<script setup lang="ts">
import { useBaseFileUpload, type FileUploadProps } from '@/components/ui/base'

const props = withDefaults(defineProps<FileUploadProps>(), { multiple: false })
defineEmits<{ 'update:modelValue': [value: File[]] }>()

const {
  inputProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  files,
  dropzoneProps,
} = useBaseFileUpload(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div
      v-bind="dropzoneProps"
      class="border-surface-300 data-[dragover=true]:border-primary-400 relative rounded border-2 border-dashed p-6 text-center text-sm"
      data-ui="file-upload"
      data-provider="vuetify0"
    >
      Drop files or click to browse
      <input v-bind="inputProps" :accept="accept" :multiple="multiple" />
    </div>
    <div v-if="files && files.length" class="mt-1 flex flex-col gap-1">
      <div v-for="entry in files" :key="entry.id" class="text-surface-600 text-sm">
        {{ entry.file.name }}
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
