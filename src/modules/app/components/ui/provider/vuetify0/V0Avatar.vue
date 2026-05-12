<script setup lang="ts">
import { Avatar } from '@vuetify/v0'

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
  <BaseAvatarField
    v-bind="$props"
    provider="vuetify0"
    :root-component="Avatar.Root"
    :image-component="Avatar.Image"
    :fallback-component="Avatar.Fallback"
  />
</template>
