<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    className?: string
  }>(),
  {
    title: 'Vuestrata logo',
    className: '',
  },
)
</script>

<template>
  <svg
    viewBox="0 0 289 227"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="title"
    preserveAspectRatio="xMidYMid meet"
    class="logo mx-auto block h-full w-auto"
    :class="className"
  >
    <path
      d="M47.9112 33.5095C51.0354 30.3853 56.1015 30.3853 59.2257 33.5095L84.3575 58.6413L66.6319 76.3679C61.946 81.0542 61.9458 88.6524 66.6319 93.3386L83.9259 110.632L59.2257 135.333C56.1015 138.457 51.0354 138.457 47.9112 135.333L5.48545 92.9069C0.799159 88.2206 0.799165 80.6225 5.48545 75.9362L47.9112 33.5095Z"
      class="fill-logo-secondary"
    />
    <path
      d="M230.912 33.5097C234.036 30.3858 239.101 30.3856 242.226 33.5097L284.651 75.9364C289.338 80.6227 289.338 88.2209 284.651 92.9072L242.226 135.333C239.101 138.457 234.036 138.457 230.912 135.333L204.143 108.563L219.367 93.3388C224.053 88.6525 224.053 81.0544 219.367 76.3681L203.711 60.7109L230.912 33.5097Z"
      class="fill-logo-secondary"
    />
    <rect
      x="143"
      y="4.24264"
      width="114"
      height="114"
      rx="9"
      transform="rotate(45 143 4.24264)"
      class="fill-logo-primary"
      stroke="#E5E5E500"
      stroke-width="6"
    />
  </svg>
</template>
