<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'

export interface SheetProps {
  modelValue?: boolean
  side?: 'left' | 'right' | 'top' | 'bottom'
  title?: string
  description?: string
}

const props = withDefaults(defineProps<SheetProps>(), {
  modelValue: false,
  side: 'right',
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const panelClasses = computed(() => {
  const base =
    'fixed z-50 bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-700 shadow-elevated transition-transform duration-200'
  if (props.side === 'left') return `${base} inset-y-0 left-0 w-[380px] max-w-[92vw] border-r`
  if (props.side === 'top') return `${base} inset-x-0 top-0 h-[320px] max-h-[85vh] border-b`
  if (props.side === 'bottom') return `${base} inset-x-0 bottom-0 h-[320px] max-h-[85vh] border-t`
  return `${base} inset-y-0 right-0 w-[380px] max-w-[92vw] border-l`
})

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div v-if="modelValue" data-provider="vuetify0" data-ui="sheet">
    <button class="fixed inset-0 z-40 bg-black/45" aria-label="Close sheet" @click="close" />
    <section :class="panelClasses" aria-modal="true" role="dialog">
      <header
        class="border-surface-200 dark:border-surface-700 flex items-start justify-between border-b p-4"
      >
        <div>
          <h3 v-if="title" class="text-base font-semibold">{{ title }}</h3>
          <p v-if="description" class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            {{ description }}
          </p>
        </div>
        <button
          class="hover:bg-surface-100 dark:hover:bg-surface-800 rounded-md p-1"
          aria-label="Close sheet"
          @click="close"
        >
          <span :class="[resolveIcon('close'), 'h-4 w-4']" />
        </button>
      </header>
      <div class="p-4">
        <slot />
      </div>
    </section>
  </div>
</template>
