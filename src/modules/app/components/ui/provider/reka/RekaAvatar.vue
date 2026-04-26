<script setup lang="ts">
export interface AvatarProps {
  src?: string
  alt?: string
  fallback?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const props = withDefaults(defineProps<AvatarProps>(), {
  alt: '',
  size: 'md',
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
</script>

<template>
  <span
    :class="[
      'inline-flex items-center justify-center overflow-hidden rounded-full',
      'bg-surface-200 dark:bg-surface-700',
      sizeMap[size],
    ]"
    data-ui="avatar"
    data-provider="reka"
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
