<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

import { useUiSwitch, type SwitchProps } from '@/composables/forms'
import { useAppStore } from '@/stores/app'

/**
 * Attributes are forwarded manually.
 *
 * With the default fallthrough, a caller's `aria-label` landed on the wrapper
 * `<div>` — which is not an interactive element, so the attribute is prohibited
 * there AND the switch itself was left with no accessible name. Two axe
 * violations from one misplaced attribute.
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SwitchProps>(), {
  size: 'md',
})

const attrs = useAttrs()

/** ARIA and identity attributes belong on the control, not the wrapper. */
const controlAttrs = computed(() => {
  const forwarded: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('aria-') || key === 'id' || key === 'title' || key === 'tabindex') {
      forwarded[key] = value
    }
  }
  return forwarded
})

/** Everything else (class, style, listeners) stays on the wrapper. */
const wrapperAttrs = computed(() => {
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (!(key in controlAttrs.value)) rest[key] = value
  }
  return rest
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const appStore = useAppStore()
const { inputProps, labelProps, isPressed, errorMessageProps, displayError } = useUiSwitch(props)

const sizeMap: Record<string, { track: string; thumb: string; on: string; off: string }> = {
  sm: { track: 'h-5 w-9', thumb: 'h-3.5 w-3.5', on: 'translate-x-4', off: 'translate-x-1' },
  md: { track: 'h-6 w-11', thumb: 'h-4 w-4', on: 'translate-x-5', off: 'translate-x-1' },
  lg: { track: 'h-7 w-14', thumb: 'h-5 w-5', on: 'translate-x-7', off: 'translate-x-1' },
}

const s = computed(() => sizeMap[props.size]!)
const thumbPositionClass = computed(() => {
  if (appStore.isRtl) {
    return isPressed.value
      ? s.value.off.replace('translate-x', '-translate-x')
      : s.value.on.replace('translate-x', '-translate-x')
  }

  return isPressed.value ? s.value.on : s.value.off
})

const trackClasses = computed(() => [
  'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors',
  isPressed.value ? 'bg-primary-700' : 'bg-surface-300 dark:bg-surface-600',
  'focus-visible:ring-primary-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  s.value.track,
])

function emitToggle() {
  if (props.disabled || props.readonly) return
  emit('update:modelValue', !(props.modelValue ?? isPressed.value))
}
</script>

<template>
  <div v-bind="wrapperAttrs" class="flex flex-col gap-1">
    <div class="inline-flex items-center gap-2">
      <SwitchRoot
        v-bind="{ ...inputProps, ...controlAttrs }"
        :class="trackClasses"
        data-ui="switch"
        data-provider="reka"
        @click="emitToggle"
        @keydown.space.prevent="emitToggle"
      >
        <SwitchThumb
          :class="[
            'block rounded-full bg-white shadow-sm transition-transform',
            thumbPositionClass,
            s.thumb,
          ]"
          style="margin-top: auto; margin-bottom: auto"
        />
      </SwitchRoot>
      <label
        v-if="label"
        v-bind="labelProps"
        class="cursor-pointer text-sm select-none"
        @click="emitToggle"
      >
        {{ label }}
      </label>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
      {{ displayError }}
    </p>
  </div>
</template>
