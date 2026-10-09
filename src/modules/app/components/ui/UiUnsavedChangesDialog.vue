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

const { t, te } = useI18n()

/**
 * The four strings, in English, for a catalog that lacks them. The keys came
 * with this dialog; a project that edited its managed catalog keeps its own
 * copy through the upgrade, without them, and the question would otherwise
 * read `form_unsaved_title`. The project's own translation wins as soon as
 * the key exists (in the catalog or in `<locale>.overrides.json`).
 */
const builtIn = {
  form_unsaved_title: 'Discard unsaved changes?',
  form_unsaved_description:
    'You have changes that have not been saved. If you leave this page, they will be lost.',
  form_unsaved_stay: 'Keep editing',
  form_unsaved_leave: 'Discard changes',
} as const

const text = (key: keyof typeof builtIn): string => (te(key) ? t(key) : builtIn[key])

function onOpenUpdate(open: boolean) {
  if (!open) emit('stay')
}
</script>

<template>
  <UiDialog
    :open="props.open"
    :title="props.title ?? text('form_unsaved_title')"
    :description="props.description ?? text('form_unsaved_description')"
    @update:open="onOpenUpdate"
  >
    <div class="flex flex-wrap justify-end gap-2">
      <UiButton variant="ghost" data-testid="unsaved-changes-stay" @click="emit('stay')">
        {{ props.stayLabel ?? text('form_unsaved_stay') }}
      </UiButton>
      <UiButton variant="destructive" data-testid="unsaved-changes-leave" @click="emit('leave')">
        {{ props.leaveLabel ?? text('form_unsaved_leave') }}
      </UiButton>
    </div>
  </UiDialog>
</template>
