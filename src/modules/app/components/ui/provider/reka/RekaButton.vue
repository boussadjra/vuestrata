<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

import { resolveIcon } from '~/config/icon-provider'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  icon?: boolean | string
  type?: 'button' | 'submit' | 'reset'
  value?: any
  active?: boolean
  ariaLabel?: string
  to?: RouteLocationRaw
  href?: string
  target?: string
  rel?: string
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  icon: false,
  type: 'button',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const slots = useSlots()

const buttonGroup = inject<{ modelValue: Ref<any>; updateValue: (val: any) => void } | null>(
  'reka-button-group',
  null,
)

const isActive = computed(() => {
  if (buttonGroup && props.value !== undefined) {
    if (Array.isArray(buttonGroup.modelValue.value)) {
      return buttonGroup.modelValue.value.includes(props.value)
    }
    return buttonGroup.modelValue.value === props.value
  }
  return !!props.active
})

const sizeClasses: Record<string, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  xl: 'px-6 py-3 text-lg',
}

const variantClasses: Record<string, string> = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 focus-visible:ring-primary-300',
  secondary:
    'bg-secondary-500 text-white hover:bg-secondary-600 active:bg-secondary-700 focus-visible:ring-secondary-300',
  accent:
    'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 focus-visible:ring-accent-300',
  ghost:
    'bg-transparent text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800',
  destructive:
    'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 focus-visible:ring-danger-300',
}

const activeVariantClasses: Record<string, string> = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 focus-visible:ring-primary-300',
  secondary: 'bg-secondary-700 text-white hover:bg-secondary-800 focus-visible:ring-secondary-300',
  accent: 'bg-accent-700 text-white hover:bg-accent-800 focus-visible:ring-accent-300',
  ghost: 'bg-surface-200 text-surface-900 dark:bg-surface-800 dark:text-white',
  destructive: 'bg-danger-700 text-white hover:bg-danger-800 focus-visible:ring-danger-300',
}

// Minimum touch hit-area expansion for sub-44px sizes (WCAG 2.5.5).
// Uses an invisible ::after pseudo-element so visual density is preserved.
const touchHitArea: Record<string, string> = {
  xs: "after:content-[''] after:absolute after:-inset-[10px] after:rounded-lg",
  sm: "after:content-[''] after:absolute after:-inset-[6px] after:rounded-lg",
  md: '',
  lg: '',
  xl: '',
}

// Size classes for icon-only mode — separate branch so no !important override is needed (L-4).
const iconOnlySizeClasses: Record<string, string> = {
  xs: 'p-1.5 text-xs min-h-[44px] min-w-[44px]',
  sm: 'p-2 text-sm min-h-[44px] min-w-[44px]',
  md: 'p-2 text-sm min-h-[44px] min-w-[44px]',
  lg: 'p-2.5 text-base min-h-[44px] min-w-[44px]',
  xl: 'p-3 text-lg min-h-[44px] min-w-[44px]',
}

const classes = computed(() => {
  const iconOnly = props.icon === true || (!!props.icon && !slots.default)
  return [
    // `relative` is required so the after pseudo-element positions against the button
    'btn relative inline-flex items-center justify-center gap-2 font-medium rounded-lg',
    // `transition` (not transition-colors) includes transform — required for hover/press scale.
    // `ease-[cubic-bezier(...)]` is the correct Tailwind v4 arbitrary easing syntax (expo deceleration).
    'transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    isLink.value && (props.disabled || props.loading) ? 'pointer-events-none opacity-50' : '',
    // Hover lift (1.02×) + press dip (0.97×): clear interactive feedback without decoration.
    // Skipped on block buttons (full-width scale is distracting) and loading (processing state).
    !props.block && !props.loading ? 'hover:scale-[1.02] active:scale-[0.97]' : '',
    // Strip all transform animations for users with vestibular sensitivities (motion-reduce).
    'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
    // Icon-only and text buttons use separate size maps — no !important needed
    iconOnly ? iconOnlySizeClasses[props.size] : sizeClasses[props.size],
    isActive.value ? activeVariantClasses[props.variant] : variantClasses[props.variant],
    props.block ? 'w-full' : '',
    // xs/sm text buttons: expand hit area invisibly via ::after
    !iconOnly ? touchHitArea[props.size] : '',
  ]
})

const isLink = computed(() => Boolean(props.to || props.href))
const rootTag = computed(() => {
  if (props.to) return RouterLink
  if (props.href) return 'a'
  return 'button'
})

function onClick(e: MouseEvent) {
  if (props.disabled || props.loading) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (buttonGroup && props.value !== undefined) {
    buttonGroup.updateValue(props.value)
  }
  emit('click', e)
}
</script>

<template>
  <component
    :is="rootTag"
    :to="to || undefined"
    :href="href || undefined"
    :target="target || undefined"
    :rel="rel || undefined"
    :type="!isLink ? type : undefined"
    :class="classes"
    :disabled="!isLink ? disabled || undefined : undefined"
    :tabindex="isLink && (disabled || loading) ? -1 : undefined"
    :aria-disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    :aria-pressed="buttonGroup ? isActive : undefined"
    :aria-label="ariaLabel || undefined"
    data-ui="button"
    data-provider="reka"
    @click="onClick"
  >
    <Transition name="btn-spin">
      <span
        v-if="loading"
        :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']"
        aria-hidden="true"
      />
    </Transition>
    <span
      v-if="!loading && typeof icon === 'string'"
      :class="[icon, 'text-[1.15em]']"
      aria-hidden="true"
    />
    <slot />
  </component>
</template>

<style scoped>
/* Spinner fades in so the onset of loading state is softer, not jarring. */
.btn-spin-enter-active {
  transition: opacity 100ms ease-out;
}
.btn-spin-enter-from {
  opacity: 0;
}
/* Respect motion preferences: no fade-in for users with vestibular sensitivities. */
@media (prefers-reduced-motion: reduce) {
  .btn-spin-enter-active {
    transition: none;
  }
}
</style>
