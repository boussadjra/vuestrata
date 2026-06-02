<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import HomeCtaSection from '@/components/layout/home/HomeCtaSection.vue'
import HomeFeaturesSection from '@/components/layout/home/HomeFeaturesSection.vue'
import HomeHeroSection from '@/components/layout/home/HomeHeroSection.vue'
import HomeTechStackSection from '@/components/layout/home/HomeTechStackSection.vue'
import type { IconName } from '@/types'

const { t } = useI18n()

const features: {
  iconName: IconName
  title: string
  desc: string
}[] = [
  {
    iconName: 'bolt',
    title: t('home_feature_vite_title'),
    desc: t('home_feature_vite_desc'),
  },
  {
    iconName: 'shield-check',
    title: t('home_feature_typed_boundaries_title'),
    desc: t('home_feature_typed_boundaries_desc'),
  },
  {
    iconName: 'palette',
    title: t('home_feature_theme_title'),
    desc: t('home_feature_theme_desc'),
  },
  {
    iconName: 'lock',
    title: t('home_feature_auth_title'),
    desc: t('home_feature_auth_desc'),
  },
]

const stackItems = [
  {
    icon: 'i-simple-icons-vuedotjs',
    label: t('home_stack_vue_label'),
    desc: t('home_stack_vue_desc'),
  },
  {
    icon: 'i-simple-icons-typescript',
    label: t('home_stack_ts_label'),
    desc: t('home_stack_ts_desc'),
  },
  {
    icon: 'i-simple-icons-tailwindcss',
    label: t('home_stack_tailwind_label'),
    desc: t('home_stack_tailwind_desc'),
  },
  {
    icon: 'i-simple-icons-vite',
    label: t('home_stack_vite_label'),
    desc: t('home_stack_vite_desc'),
  },
  {
    icon: 'i-simple-icons-pinia',
    label: t('home_stack_pinia_label'),
    desc: t('home_stack_pinia_desc'),
  },
  {
    icon: 'i-simple-icons-rekaui',
    label: t('home_stack_reka_label'),
    desc: t('home_stack_reka_desc'),
  },
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
