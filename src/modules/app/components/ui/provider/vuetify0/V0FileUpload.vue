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
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <div
      v-bind="dropzoneProps"
      :class="[
        'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
        'border-surface-300 dark:border-surface-600 hover:border-surface-400',
        'data-[dragover=true]:border-primary-400 data-[dragover=true]:bg-primary-50 dark:data-[dragover=true]:bg-primary-900/20',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ]"
      data-ui="file-upload"
      data-provider="vuetify0"
    >
      <span class="text-surface-400 text-sm">Drop files here or click to browse</span>
      <input v-bind="inputProps" :accept="accept" :multiple="multiple" />
    </div>

    <div v-if="files && files.length > 0" class="mt-1 flex flex-col gap-1">
      <div
        v-for="entry in files"
        :key="entry.id"
        class="bg-surface-50 dark:bg-surface-800 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
      >
        <span class="text-surface-700 dark:text-surface-300 flex-1 truncate">{{
          entry.file.name
        }}</span>
        <span class="text-surface-400 text-xs">{{ (entry.file.size / 1024).toFixed(1) }}KB</span>
      </div>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
