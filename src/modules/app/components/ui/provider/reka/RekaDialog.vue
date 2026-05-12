<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'

import BaseDialogField from '@/components/ui/base/BaseDialogField.vue'

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

const components = {
  root: DialogRoot,
  trigger: DialogTrigger,
  portal: DialogPortal,
  overlay: DialogOverlay,
  content: DialogContent,
  title: DialogTitle,
  description: DialogDescription,
  close: DialogClose,
}
</script>

<template>
  <BaseDialogField
    provider="reka"
    :components="components"
    v-bind="props"
    @update:open="emit('update:open', $event)"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BaseDialogField>
</template>
