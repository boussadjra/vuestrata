<script setup lang="ts">
import { Dialog } from '@vuetify/v0'

import { resolveIcon } from '~/config/icon-provider'

export interface DialogProps {
  open?: boolean
  title?: string
  description?: string
  contentClass?: string
}

const props = withDefaults(defineProps<DialogProps>(), {
  open: undefined,
  contentClass: '',
})

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const slots = useSlots()
</script>

<template>
  <Dialog.Root
    :model-value="props.open"
    @update:model-value="(v: boolean) => emit('update:open', v)"
  >
    <Dialog.Activator v-if="slots.trigger" as-child>
      <slot name="trigger" />
    </Dialog.Activator>

    <Dialog.Content
      :class="[
        'dark:bg-surface-800 shadow-elevated animate-scale-in fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 focus:outline-none',
        props.contentClass,
      ]"
      data-ui="dialog"
      data-provider="vuetify0"
    >
      <div
        class="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        data-ui="dialog-overlay"
      />
      <Dialog.Title v-if="props.title" class="mb-1 text-lg font-semibold">
        {{ props.title }}
      </Dialog.Title>
      <Dialog.Description v-if="props.description" class="text-surface-500 mb-4 text-sm">
        {{ props.description }}
      </Dialog.Description>

      <slot />

      <Dialog.Close
        class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-4 right-4 rounded-md p-1 transition-colors"
        aria-label="Close"
      >
        <span :class="[resolveIcon('close'), 'h-4 w-4']" />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Root>
</template>
