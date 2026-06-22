<script setup lang="ts">
import type { Component } from 'vue'

export interface AvatarProps {
  provider?: 'reka'
  src?: string
  alt?: string
  fallback?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  rootComponent?: Component
  imageComponent?: Component
  fallbackComponent?: Component
}

const props = withDefaults(defineProps<AvatarProps>(), {
  provider: 'reka',
  alt: '',
  size: 'md',
  rootComponent: undefined,
  imageComponent: undefined,
  fallbackComponent: undefined,
})

const sizeMap: Record<string, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
}

const initials = computed(() => {
  if (props.fallback) return props.fallback.slice(0, 2).toUpperCase()
  if (props.alt) {
    return props.alt
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }
  return '?'
})

const imgError = ref(false)
const showFallback = computed(() => !props.src || imgError.value)
const useProviderAvatar = computed(() =>
  Boolean(props.rootComponent && props.imageComponent && props.fallbackComponent),
)
</script>

<template>
  <component
    :is="rootComponent"
    v-if="useProviderAvatar"
    :class="[
      'inline-flex items-center justify-center overflow-hidden rounded-full',
      'bg-surface-200 dark:bg-surface-700',
      sizeMap[size],
    ]"
    data-ui="avatar"
    :data-provider="provider"
  >
    <component
      :is="imageComponent"
      v-if="!showFallback"
      :src="src"
      :alt="alt"
      class="h-full w-full object-cover"
      @error="imgError = true"
    />
    <component
      :is="fallbackComponent"
      v-else
      class="text-surface-600 dark:text-surface-300 font-medium select-none"
    >
      {{ initials }}
    </component>
  </component>

  <span
    v-else
    :class="[
      'inline-flex items-center justify-center overflow-hidden rounded-full',
      'bg-surface-200 dark:bg-surface-700',
      sizeMap[size],
    ]"
    data-ui="avatar"
    :data-provider="provider"
  >
    <img
      v-if="!showFallback"
      :src="src"
      :alt="alt"
      class="h-full w-full object-cover"
      @error="imgError = true"
    />
    <span v-else class="text-surface-600 dark:text-surface-300 font-medium select-none">
      {{ initials }}
    </span>
  </span>
</template>
