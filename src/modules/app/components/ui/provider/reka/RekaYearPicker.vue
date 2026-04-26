<script setup lang="ts">
import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

export interface YearPickerProps extends DateFieldProps {}

const props = withDefaults(defineProps<YearPickerProps>(), { size: 'md' })

const emit = defineEmits<{
  'update:modelValue': [value: Date]
}>()

const { controlProps, displayError } = useBaseDateField({
  label: props.label,
  name: props.name,
  disabled: props.disabled,
  readonly: props.readonly,
  modelValue: props.modelValue,
  locale: props.locale,
  formatOptions: { year: 'numeric' },
})

const isOpen = ref(false)

const currentDecadeStart = computed(() => {
  const y = props.modelValue?.getFullYear() ?? new Date().getFullYear()
  return y - (y % 10)
})

const years = computed(() => Array.from({ length: 12 }, (_, i) => currentDecadeStart.value - 1 + i))

function selectYear(year: number) {
  const d = new Date(props.modelValue ?? new Date())
  d.setFullYear(year)
  emit('update:modelValue', d)
  isOpen.value = false
}

const shownError = computed(() => displayError.value || props.error)
</script>

<template>
  <div class="flex flex-col gap-1" data-provider="reka">
    <label v-if="label" class="text-surface-700 dark:text-surface-300 text-sm font-medium">{{
      label
    }}</label>
    <div class="relative">
      <button
        type="button"
        v-bind="controlProps"
        class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 w-full rounded-md border bg-white px-3 py-2 text-left text-sm"
        :class="{ 'cursor-not-allowed opacity-50': disabled }"
        :disabled="disabled"
        @click="isOpen = !isOpen"
      >
        {{ modelValue ? modelValue.getFullYear() : 'Select year' }}
      </button>

      <div
        v-if="isOpen"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 absolute z-50 mt-1 w-48 rounded-md border bg-white p-2 shadow-lg"
      >
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="year in years"
            :key="year"
            type="button"
            class="hover:bg-primary-100 dark:hover:bg-primary-900 rounded px-2 py-1.5 text-sm"
            :class="{
              'bg-primary-500 hover:bg-primary-600 text-white': modelValue?.getFullYear() === year,
              'text-surface-400': year < currentDecadeStart || year > currentDecadeStart + 9,
            }"
            @click="selectYear(year)"
          >
            {{ year }}
          </button>
        </div>
      </div>
    </div>
    <p v-if="shownError" class="text-xs text-red-500" role="alert">{{ shownError }}</p>
    <p v-else-if="hint || description" class="text-surface-500 dark:text-surface-400 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
