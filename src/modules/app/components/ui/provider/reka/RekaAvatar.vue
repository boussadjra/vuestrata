<script setup lang="ts">
import BaseAvatarField from '@/components/ui/base/BaseAvatarField.vue'

export interface AvatarProps {
  src?: string
  alt?: string
  fallback?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

defineProps<AvatarProps>()
</script>

<template>
  <BaseAvatarField v-bind="$props" provider="reka" />
</template>
