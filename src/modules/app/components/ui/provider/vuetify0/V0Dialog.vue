<script setup lang="ts">
import { Dialog } from '@vuetify/v0'

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
  root: Dialog.Root,
  trigger: Dialog.Activator,
  content: Dialog.Content,
  title: Dialog.Title,
  description: Dialog.Description,
  close: Dialog.Close,
}
</script>

<template>
  <BaseDialogField
    provider="vuetify0"
    :components="components"
    v-bind="props"
    @update:open="emit('update:open', $event)"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BaseDialogField>
</template>
