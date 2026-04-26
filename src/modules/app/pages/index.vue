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
  color: string
  bg: string
  text: string
  ring: string
}[] = [
  {
    iconName: 'bolt',
    title: 'Lightning Fast',
    desc: 'Vite-powered HMR, tree-shaking, and optimized builds out of the box.',
    color: 'from-primary-500 to-primary-600',
    bg: 'bg-primary-500/10 dark:bg-primary-500/20',
    text: 'text-primary-500',
    ring: 'group-hover:ring-primary-500/20',
  },
  {
    iconName: 'shield-check',
    title: 'Type-Safe',
    desc: 'End-to-end TypeScript with strict mode — catch bugs before runtime.',
    color: 'from-accent-500 to-accent-600',
    bg: 'bg-accent-500/10 dark:bg-accent-500/20',
    text: 'text-accent-500',
    ring: 'group-hover:ring-accent-500/20',
  },
  {
    iconName: 'palette',
    title: 'Beautiful UI',
    desc: '25+ headless components with Tailwind v4 — dark mode included.',
    color: 'from-secondary-500 to-secondary-600',
    bg: 'bg-secondary-500/10 dark:bg-secondary-500/20',
    text: 'text-secondary-500',
    ring: 'group-hover:ring-secondary-500/20',
  },
  {
    iconName: 'lock',
    title: 'Auth Ready',
    desc: 'JWT, OAuth, magic links, RBAC — production auth patterns built in.',
    color: 'from-cyan-500 to-teal-600',
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    text: 'text-cyan-500',
    ring: 'group-hover:ring-cyan-500/20',
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
