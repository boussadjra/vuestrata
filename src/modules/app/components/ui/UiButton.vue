<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

import { resolveIcon } from '~/config/icon-provider'
import type { ButtonGroupItemValue, ButtonGroupModelValue } from '~/types'

export interface ButtonProps {
  provider?: 'reka'
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  icon?: boolean | string
  type?: 'button' | 'submit' | 'reset'
  value?: ButtonGroupItemValue
  active?: boolean
  ariaLabel?: string
  to?: RouteLocationRaw
  href?: string
  target?: string
  rel?: string
}

const props = withDefaults(defineProps<ButtonProps>(), {
  provider: 'reka',
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

const buttonGroup = inject<{
  modelValue: Ref<ButtonGroupModelValue>
  updateValue: (val: ButtonGroupItemValue) => void
} | null>('reka-button-group', null)

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
  md: 'px-4 py-2 text-sm min-h-[44px] min-w-[44px] lg:min-h-9 lg:min-w-9',
  lg: 'px-5 py-2.5 text-base',
  xl: 'px-6 py-3 text-lg',
}

const variantClasses: Record<string, string> = {
  primary:
    'bg-primary-700 text-white shadow-[var(--shadow-soft)] hover:bg-primary-800 hover:shadow-[var(--shadow-card)] active:bg-primary-900',
  secondary:
    'bg-secondary-700 text-white shadow-[var(--shadow-soft)] hover:bg-secondary-800 hover:shadow-[var(--shadow-card)] active:bg-secondary-900',
  accent:
    'bg-accent-700 text-white shadow-[var(--shadow-soft)] hover:bg-accent-800 hover:shadow-[var(--shadow-card)] active:bg-accent-900',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  destructive:
    'bg-danger-700 text-white shadow-[var(--shadow-soft)] hover:bg-danger-800 hover:shadow-[var(--shadow-card)] active:bg-danger-900',
}

const activeVariantClasses: Record<string, string> = {
  primary: 'bg-primary-800 text-white hover:bg-primary-900',
  secondary: 'bg-secondary-800 text-white hover:bg-secondary-900',
  accent: 'bg-accent-800 text-white hover:bg-accent-900',
  ghost: 'bg-muted text-foreground',
  destructive: 'bg-danger-800 text-white hover:bg-danger-900',
}

const touchHitArea: Record<string, string> = {
  xs: "after:content-[''] after:absolute after:-inset-[10px] after:rounded-lg",
  sm: "after:content-[''] after:absolute after:-inset-[6px] after:rounded-lg",
  md: '',
  lg: '',
  xl: '',
}

const iconOnlySizeClasses: Record<string, string> = {
  xs: 'p-1.5 text-xs min-h-[44px] min-w-[44px]',
  sm: 'p-2 text-sm min-h-[44px] min-w-[44px]',
  md: 'p-2 text-sm min-h-[44px] min-w-[44px]',
  lg: 'p-2.5 text-base min-h-[44px] min-w-[44px]',
  xl: 'p-3 text-lg min-h-[44px] min-w-[44px]',
}

const iconOnly = computed(() => props.icon === true || (!!props.icon && !slots.default))

const needsPositionContext = computed(() => !iconOnly.value && Boolean(touchHitArea[props.size]))

const classes = computed(() => {
  return [
    'btn inline-flex items-center justify-center gap-2 rounded-[var(--shape-radius-sm)] font-medium',
    needsPositionContext.value ? 'relative' : '',
    'transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer',
    /*
     * No `focus-visible:outline-none` here.
     *
     * This used to cancel app.css's global `*:focus-visible` outline — the one
     * app-wide focus indicator, built on `--color-ring`, which re-points per
     * theme AND per colour mode — and replace it with a `ring-<hue>-300`.
     * A 300-weight ring is a tint: it measured 1.66:1 against the page on the
     * default theme and 2.08:1 on Brutalist, well under the 3:1 that
     * WCAG 1.4.11 requires of a focus indicator. `--color-ring` clears 3:1 on
     * every theme in both modes, so the button now just uses it.
     */
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    isLink.value && (props.disabled || props.loading) ? 'pointer-events-none opacity-50' : '',
    !props.block && !props.loading ? 'hover:scale-[1.02] active:scale-[0.97]' : '',
    'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
    iconOnly.value ? iconOnlySizeClasses[props.size] : sizeClasses[props.size],
    isActive.value ? activeVariantClasses[props.variant] : variantClasses[props.variant],
    props.block ? 'w-full' : '',
    !iconOnly.value ? touchHitArea[props.size] : '',
  ]
})

const isLink = computed(() => Boolean(props.to || props.href))

const commonAttrs = computed(() => ({
  class: classes.value,
  'aria-disabled': props.disabled || props.loading || undefined,
  'aria-busy': props.loading || undefined,
  'aria-pressed': buttonGroup ? isActive.value : undefined,
  'aria-label': props.ariaLabel || undefined,
  'data-ui': 'button',
  'data-provider': 'reka',
  /*
   * Themes need to tell a filled button from a ghost one. The variant is
   * otherwise only visible as a bundle of Tailwind classes, which a theme
   * stylesheet cannot match on without hardcoding this component's internals.
   */
  'data-variant': props.variant,
}))

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

function onRouterLinkClick(e: MouseEvent, navigate: (event?: MouseEvent) => void) {
  onClick(e)
  if (e.defaultPrevented) return
  navigate(e)
}
</script>

<template>
  <RouterLink v-if="to" :to="to" custom v-slot="{ href: routerHref, navigate }">
    <a
      :href="routerHref"
      :target="target || undefined"
      :rel="rel || undefined"
      :tabindex="disabled || loading ? -1 : undefined"
      v-bind="commonAttrs"
      @click="onRouterLinkClick($event, navigate)"
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
    </a>
  </RouterLink>

  <a
    v-else-if="href"
    :href="href"
    :target="target || undefined"
    :rel="rel || undefined"
    :tabindex="disabled || loading ? -1 : undefined"
    v-bind="commonAttrs"
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
  </a>

  <button
    v-else
    :type="type"
    :value="value == null ? undefined : String(value)"
    :disabled="disabled || undefined"
    v-bind="commonAttrs"
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
  </button>
</template>

<style scoped>
.btn-spin-enter-active {
  transition: opacity 100ms ease-out;
}
.btn-spin-enter-from {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .btn-spin-enter-active {
    transition: none;
  }
}
</style>
