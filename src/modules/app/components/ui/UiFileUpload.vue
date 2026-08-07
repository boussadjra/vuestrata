<script setup lang="ts">
import { useUiFileUpload, type FileUploadProps } from '@/composables/forms'

export interface FileUploadFieldProps extends FileUploadProps {
  provider?: 'reka'
}

const props = withDefaults(defineProps<FileUploadFieldProps>(), {
  provider: 'reka',
  multiple: false,
})

defineEmits<{ 'update:modelValue': [value: File[]] }>()

const {
  inputProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  files,
  dropzoneProps,
} = useUiFileUpload(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
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
      :data-provider="provider"
    >
      <span class="text-muted-foreground text-sm">Drop files here or click to browse</span>
      <input v-bind="inputProps" :accept="accept" :multiple="multiple" />
    </div>

    <div v-if="files && files.length > 0" class="mt-1 flex flex-col gap-1">
      <div
        v-for="entry in files"
        :key="entry.id"
        class="bg-surface-50 dark:bg-surface-800 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
      >
        <span class="text-foreground flex-1 truncate">{{ entry.file.name }}</span>
        <span class="text-muted-foreground text-xs"
          >{{ (entry.file.size / 1024).toFixed(1) }}KB</span
        >
      </div>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-muted-foreground text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
