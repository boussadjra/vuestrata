<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon, safeResolveIcon } from '@/config/icon-provider'
import { useModuleStore } from '@/modules'
import { useAppStore } from '@/stores/app'
import type { IconName } from '@/types'
import type { SidebarItem } from '@/types'

const { t } = useI18n()
const appStore = useAppStore()
const route = useRoute()
const { can } = useRbac()
const moduleStore = useModuleStore()

const navItems: (SidebarItem & { iconName: IconName })[] = [
  { label: 'sidebar_components', icon: '', iconName: 'widget', to: '/docs/components/overview' },
]

function isVisible(item: SidebarItem): boolean {
  if (!item.permission) return true
  return can(item.permission)
}

function isModuleItemVisible(item: { permission?: SidebarItem['permission'] }): boolean {
  if (!item.permission) return true
  return can(item.permission)
}
</script>

<template>
  <aside
    role="navigation"
    :aria-label="t('sidebar_aria_label')"
    :class="[
      'fixed inset-y-0 inset-s-0 z-40 flex flex-col border-e',
      'border-surface-200/80 dark:border-surface-700/60',
      'dark:bg-surface-900/96 bg-white/96 transition-all duration-300',
      appStore.sidebarCollapsed ? 'w-16' : 'w-64',
      'max-lg:data-[open=true]:translate-x-0 max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
    ]"
    :data-open="!appStore.sidebarCollapsed"
  >
    <!-- Sidebar header -->
    <div
      class="border-surface-200/80 dark:border-surface-700/60 flex h-16 items-center justify-between border-b px-4"
    >
      <RouterLink
        v-if="!appStore.sidebarCollapsed"
        to="/"
        class="focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 flex min-w-0 items-center gap-3 rounded-xl text-lg font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span class="h-10 w-auto shrink-0">
          <Logo class="mt-1 h-6 w-auto shrink-0" />
        </span>
        <span class="text-primary-500 dark:text-primary-400 truncate">Vuestrata</span>
      </RouterLink>
      <button
        :aria-label="t('sidebar_toggle')"
        class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
        @click="appStore.toggleSidebar()"
      >
        <span :class="[resolveIcon('sidebar'), 'h-4 w-4']" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto p-3">
      <!-- Module-owned nav items (sorted by order) -->
      <ul class="space-y-1">
        <li
          v-for="item in moduleStore.navItems"
          :key="item.to ?? item.label"
          v-show="isModuleItemVisible(item)"
        >
          <RouterLink
            v-if="item.to"
            :to="item.to"
            :aria-label="t(item.label)"
            :aria-current="route.path === item.to ? 'page' : undefined"
            :class="[
              'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
              'text-surface-600 dark:text-surface-400',
              'hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
              'focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            ]"
            active-class="!bg-primary-50 dark:!bg-primary-900/20 !text-primary-600 dark:!text-primary-400 shadow-sm"
          >
            <span
              :class="[
                safeResolveIcon(item.icon),
                'h-5 w-5 shrink-0 transition-transform group-hover:scale-110',
              ]"
            />
            <span v-if="!appStore.sidebarCollapsed" class="truncate">{{ t(item.label) }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- Static nav items (not module-owned) -->
      <ul v-if="navItems.length" class="mt-1 space-y-1">
        <li v-for="item in navItems" :key="item.to" v-show="isVisible(item)">
          <RouterLink
            :to="item.to!"
            :aria-label="t(item.label)"
            :aria-current="route.path === item.to ? 'page' : undefined"
            :class="[
              'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
              'text-surface-600 dark:text-surface-400',
              'hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
              'focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            ]"
            active-class="!bg-primary-50 dark:!bg-primary-900/20 !text-primary-600 dark:!text-primary-400 shadow-sm"
          >
            <span
              :class="[
                resolveIcon(item.iconName),
                'h-5 w-5 shrink-0 transition-transform group-hover:scale-110',
              ]"
            />
            <span v-if="!appStore.sidebarCollapsed" class="truncate">
              {{ t(item.label) }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </nav>
  </aside>

  <!-- Overlay for mobile -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="!appStore.sidebarCollapsed"
      class="fixed inset-0 z-30 bg-black/40 lg:hidden"
      @click="appStore.toggleSidebar()"
    />
  </Transition>
</template>
