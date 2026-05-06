<script setup lang="ts">
import HomeCtaSection from '@/components/layout/home/HomeCtaSection.vue'
import HomeFeaturesSection from '@/components/layout/home/HomeFeaturesSection.vue'
import HomeHeroSection from '@/components/layout/home/HomeHeroSection.vue'
import HomeTechStackSection from '@/components/layout/home/HomeTechStackSection.vue'
import type { IconName } from '@/types'

const features: {
  iconName: IconName
  title: string
  desc: string
}[] = [
  {
    iconName: 'bolt',
    title: 'Vite+ command path',
    desc: 'Install, check, test, build, and run through one toolchain instead of a pile of wrappers.',
  },
  {
    iconName: 'shield-check',
    title: 'Typed boundaries',
    desc: 'Query keys, API calls, validation, and module contracts stay explicit from the start.',
  },
  {
    iconName: 'palette',
    title: 'Theme integrity',
    desc: 'Ten theme personalities share one token vocabulary across light and dark modes.',
  },
  {
    iconName: 'lock',
    title: 'Auth contract',
    desc: 'JWT, OAuth, magic-link mocks, RBAC, env keys, and docs stay aligned as one surface.',
  },
]

const stackItems = [
  { icon: 'i-simple-icons-vuedotjs', label: 'Vue 3.5', desc: 'Composition API' },
  { icon: 'i-simple-icons-typescript', label: 'TypeScript 6', desc: 'Strict mode' },
  { icon: 'i-simple-icons-tailwindcss', label: 'Tailwind v4', desc: 'CSS-first config' },
  { icon: 'i-simple-icons-vite', label: 'Vite+', desc: 'Unified toolchain' },
  { icon: 'i-simple-icons-pinia', label: 'Pinia 3', desc: 'State management' },
  { icon: 'i-simple-icons-rekaui', label: 'Reka UI 2', desc: 'Headless components' },
]
</script>

<template>
  <div class="home-page relative overflow-hidden">
    <HomeHeroSection :stack-items="stackItems" />
    <HomeFeaturesSection :features="features" />
    <HomeTechStackSection :stack-items="stackItems" />
    <HomeCtaSection />
  </div>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
