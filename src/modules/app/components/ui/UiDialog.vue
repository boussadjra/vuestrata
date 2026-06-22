<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

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
const { t } = useI18n()

function onOpenUpdate(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="onOpenUpdate">
    <DialogTrigger v-if="slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay
        class="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        data-ui="dialog-overlay"
        data-provider="reka"
      />
      <DialogContent
        :class="[
          'shaped-border shaped-radius-lg shaped-shadow dark:bg-surface-800 animate-scale-in fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 border bg-white p-6 focus:outline-none',
          props.contentClass,
        ]"
        data-ui="dialog"
        data-provider="reka"
      >
        <DialogTitle v-if="props.title" class="mb-1 text-lg font-semibold">
          {{ props.title }}
        </DialogTitle>
        <DialogDescription v-if="props.description" class="text-surface-500 mb-4 text-sm">
          {{ props.description }}
        </DialogDescription>

        <slot />

        <DialogClose
          class="shaped-radius-sm hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-4 right-4 p-1 transition-colors"
          :aria-label="t('button_close')"
        >
          <span :class="[resolveIcon('close'), 'h-4 w-4']" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
