<script setup lang="ts">
/**
 * The question `useUnsavedChangesGuard` asks: keep editing, or discard?
 *
 * Built on `UiDialog`, so focus is trapped inside it and returns to where it
 * was. Escape, the overlay and the close button all mean "keep editing", the
 * answer that loses nothing, and that is also where focus starts.
 */
import { useI18n } from 'vue-i18n'

import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

export interface UnsavedChangesDialogProps {
  open?: boolean
  title?: string
  description?: string
  stayLabel?: string
  leaveLabel?: string
}

const props = withDefaults(defineProps<UnsavedChangesDialogProps>(), {
  open: false,
})

const emit = defineEmits<{
  stay: []
  leave: []
}>()

const { t } = useI18n()

function onOpenUpdate(open: boolean) {
  if (!open) emit('stay')
}
</script>

<template>
  <UiDialog
    :open="props.open"
    :title="props.title ?? t('form_unsaved_title')"
    :description="props.description ?? t('form_unsaved_description')"
    @update:open="onOpenUpdate"
  >
    <div class="flex flex-wrap justify-end gap-2">
      <UiButton variant="ghost" data-testid="unsaved-changes-stay" @click="emit('stay')">
        {{ props.stayLabel ?? t('form_unsaved_stay') }}
      </UiButton>
      <UiButton variant="destructive" data-testid="unsaved-changes-leave" @click="emit('leave')">
        {{ props.leaveLabel ?? t('form_unsaved_leave') }}
      </UiButton>
    </div>
  </UiDialog>
</template>
