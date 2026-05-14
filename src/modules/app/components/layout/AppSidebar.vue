<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { UiButton } from '@/components/ui'
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
      'border-surface-200/70 bg-surface-50/88 dark:border-surface-800/70 dark:bg-surface-950/84 backdrop-blur-xl',
      'transition-[width,transform,background-color,border-color] duration-300',
      appStore.sidebarCollapsed ? 'w-[4.5rem]' : 'w-72',
      'max-lg:data-[open=true]:translate-x-0 max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
    ]"
    :data-open="!appStore.sidebarCollapsed"
  >
    <!-- Sidebar header -->
    <div
      class="border-surface-200/70 dark:border-surface-800/70 flex h-16 items-center justify-between gap-2 border-b px-3"
    >
      <RouterLink
        v-if="!appStore.sidebarCollapsed"
        to="/"
        class="focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 flex min-w-0 items-center gap-3 rounded-full p-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span
          class="border-surface-200/80 bg-surface-50 dark:border-surface-700/70 dark:bg-surface-900/82 flex h-10 w-10 items-center justify-center rounded-full border shadow-(--shadow-soft)"
        >
          <Logo class="h-6 w-auto shrink-0" />
        </span>
        <span class="min-w-0">
          <span class="text-primary-600 dark:text-primary-300 block truncate text-sm font-semibold">
            Vuestrata
          </span>
          <span
            class="text-surface-400 dark:text-surface-500 mt-0.5 block truncate text-[11px] font-medium tracking-[0.18em] uppercase"
          >
            Workspace
          </span>
        </span>
      </RouterLink>
      <RouterLink
        v-else
        to="/"
        class="focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 border-surface-200/80 bg-surface-50 dark:border-surface-700/70 dark:bg-surface-900/82 flex h-10 w-10 items-center justify-center rounded-full border shadow-(--shadow-soft) focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Logo class="h-6 w-auto shrink-0" />
      </RouterLink>
      <UiButton
        variant="ghost"
        size="md"
        icon
        class="rounded-full"
        :aria-label="t('sidebar_toggle')"
        @click="appStore.toggleSidebar()"
      >
        <span :class="[resolveIcon('sidebar'), 'h-4 w-4']" />
      </UiButton>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-2.5 py-4">
      <div v-if="moduleStore.navItems.length && !appStore.sidebarCollapsed" class="mb-2 px-3">
        <p
          class="text-surface-400 dark:text-surface-500 text-[11px] font-medium tracking-[0.18em] uppercase"
        >
          Workspace
        </p>
      </div>

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
              'group flex min-h-11 items-center gap-3 rounded-[var(--shape-radius-sm)] px-3.5 py-2.5 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-200',
              'text-surface-600 dark:text-surface-400',
              'hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
              'focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            ]"
            active-class="!bg-primary-50/90 dark:!bg-primary-950/36 !text-primary-700 dark:!text-primary-300 shadow-[var(--shadow-soft)]"
          >
            <span
              :class="[
                safeResolveIcon(item.icon),
                'h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5',
              ]"
            />
            <span v-if="!appStore.sidebarCollapsed" class="truncate">{{ t(item.label) }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- Static nav items (not module-owned) -->
      <div v-if="navItems.length && !appStore.sidebarCollapsed" class="mt-5 mb-2 px-3">
        <p
          class="text-surface-400 dark:text-surface-500 text-[11px] font-medium tracking-[0.18em] uppercase"
        >
          Reference
        </p>
      </div>
      <ul v-if="navItems.length" class="mt-1 space-y-1">
        <li v-for="item in navItems" :key="item.to" v-show="isVisible(item)">
          <RouterLink
            :to="item.to!"
            :aria-label="t(item.label)"
            :aria-current="route.path === item.to ? 'page' : undefined"
            :class="[
              'group flex min-h-11 items-center gap-3 rounded-[var(--shape-radius-sm)] px-3.5 py-2.5 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-200',
              'text-surface-600 dark:text-surface-400',
              'hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
              'focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            ]"
            active-class="!bg-primary-50/90 dark:!bg-primary-950/36 !text-primary-700 dark:!text-primary-300 shadow-[var(--shadow-soft)]"
          >
            <span
              :class="[
                resolveIcon(item.iconName),
                'h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5',
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
      class="bg-surface-950/45 fixed inset-0 z-30 backdrop-blur-[2px] lg:hidden"
      @click="appStore.toggleSidebar()"
    />
  </Transition>
</template>
