<script setup lang="ts">
import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<DateFieldProps>(), { size: 'md' })

defineEmits<{ 'update:modelValue': [value: Date] }>()

const { controlProps, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseDateField({
    ...props,
    formatOptions: { year: 'numeric' },
  })

const isOpen = ref(false)

const currentDecadeStart = computed(() => {
  const y = props.modelValue?.getFullYear() ?? new Date().getFullYear()
  return y - (y % 10)
})

const years = computed(() => Array.from({ length: 12 }, (_, i) => currentDecadeStart.value - 1 + i))
</script>

<template>
  <div class="flex flex-col gap-1" data-provider="vuetify0">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <button
      type="button"
      v-bind="controlProps"
      class="w-full rounded border px-3 py-2 text-left text-sm"
      :disabled="disabled"
      @click="isOpen = !isOpen"
    >
      {{ modelValue ? modelValue.getFullYear() : 'Select year' }}
    </button>
    <div v-if="isOpen" class="dark:bg-surface-800 mt-1 rounded border bg-white p-2 shadow">
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="year in years"
          :key="year"
          type="button"
          class="hover:bg-primary-100 dark:hover:bg-primary-900 rounded px-2 py-1.5 text-sm"
          :class="{ 'bg-primary-500 text-white': modelValue?.getFullYear() === year }"
        >
          {{ year }}
        </button>
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
