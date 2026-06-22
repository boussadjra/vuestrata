<script setup lang="ts">
import {
  AvatarFallback,
  AvatarImage,
  AvatarRoot,
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

export interface AvatarProps {
  provider?: 'reka'
  src?: string
  alt?: string
  fallback?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  fallbackDelayMs?: number
  tooltip?: string
}

const props = withDefaults(defineProps<AvatarProps>(), {
  provider: 'reka',
  alt: '',
  size: 'md',
  fallbackDelayMs: 600,
  tooltip: undefined,
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

const avatarClasses = computed(() => [
  'inline-flex items-center justify-center overflow-hidden rounded-full',
  'bg-surface-200 dark:bg-surface-700',
  sizeMap[props.size],
])
</script>

<template>
  <TooltipRoot v-if="tooltip">
    <TooltipTrigger as-child>
      <AvatarRoot :class="avatarClasses" data-ui="avatar" :data-provider="provider">
        <AvatarImage
          v-if="src"
          :src="src"
          :alt="alt"
          class="h-full w-full rounded-[inherit] object-cover"
        />
        <AvatarFallback
          :delay-ms="fallbackDelayMs"
          class="text-surface-600 dark:text-surface-300 dark:bg-surface-800 flex h-full w-full items-center justify-center bg-white font-medium select-none"
        >
          {{ initials }}
        </AvatarFallback>
      </AvatarRoot>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        side="top"
        :side-offset="6"
        class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
      >
        {{ tooltip }}
        <TooltipArrow class="fill-surface-900 dark:fill-surface-100" :width="8" :height="4" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>

  <AvatarRoot v-else :class="avatarClasses" data-ui="avatar" :data-provider="provider">
    <AvatarImage
      v-if="src"
      :src="src"
      :alt="alt"
      class="h-full w-full rounded-[inherit] object-cover"
    />
    <AvatarFallback
      :delay-ms="fallbackDelayMs"
      class="text-surface-600 dark:text-surface-300 dark:bg-surface-800 flex h-full w-full items-center justify-center bg-white font-medium select-none"
    >
      {{ initials }}
    </AvatarFallback>
  </AvatarRoot>
</template>
