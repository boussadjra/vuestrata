<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title?: string
    className?: string
    variant?: 'full' | 'icon'
  }>(),
  {
    title: 'Vuestrata logo',
    className: '',
    variant: 'full',
  },
)

const isNarrowViewport = useMediaQuery('(max-width: 480px)')
const isIconOnly = computed(() => props.variant === 'icon' || isNarrowViewport.value)
const viewBox = computed(() => (isIconOnly.value ? '0 0 64 64' : '0 0 248 64'))
</script>

<template>
  <svg
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="title"
    direction="ltr"
    preserveAspectRatio="xMidYMid meet"
    class="logo w-auto shrink-0"
    :class="className"
  >
    <g id="logo-icon">
      <rect width="64" height="64" rx="8" fill="#031b38" />
      <path
        d="M0 30 90 0v23L0 53Z M0 75 90 45v23L0 98Z M0 120 90 90v23L0 143Z"
        transform="translate(18.5 10.5) scale(.3)"
        fill="#cf4c18"
      />
    </g>
    <g v-if="!isIconOnly" id="logo-text" fill="var(--color-foreground)">
      <text
        x="80"
        y="43"
        font-size="34"
        font-weight="700"
        letter-spacing="-1"
        font-family="'Vuestrata Jakarta', ui-sans-serif, sans-serif"
      >
        Vuestrata
      </text>
    </g>
  </svg>
</template>
