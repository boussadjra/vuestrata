<script setup lang="ts">
import AppNotifications from '@/components/layout/AppNotifications.vue'
import { resolveIcon } from '@/config/icon-provider'

const route = useRoute()
const sidebarOpen = ref(false)

interface NavCategory {
  title: string
  items: { label: string; to: string; iconName: string }[]
}

const categories: NavCategory[] = [
  {
    title: 'Forms',
    items: [
      { label: 'Button', to: '/components/buttons', iconName: 'widget' },
      { label: 'TextField', to: '/components/text-fields', iconName: 'document' },
      { label: 'Textarea', to: '/components/textareas', iconName: 'document' },
      { label: 'Checkbox', to: '/components/checkboxes', iconName: 'document' },
      { label: 'Switch', to: '/components/switches', iconName: 'settings' },
      { label: 'RadioGroup', to: '/components/radio-group', iconName: 'document' },
      { label: 'Select', to: '/components/selects', iconName: 'document' },
      { label: 'Form Builder Guide', to: '/components/forms/form-builder', iconName: 'document' },
    ],
  },
  {
    title: 'Data Display',
    items: [
      { label: 'DataTable', to: '/components/data-table', iconName: 'database' },
      { label: 'Badge', to: '/components/badges', iconName: 'widget' },
      { label: 'Avatar', to: '/components/avatars', iconName: 'users' },
      { label: 'Card', to: '/components/cards', iconName: 'widget' },
      { label: 'Progress', to: '/components/progress', iconName: 'graph' },
      { label: 'Skeleton', to: '/components/skeleton', iconName: 'widget' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { label: 'Tabs', to: '/components/tabs', iconName: 'widget' },
      { label: 'Breadcrumb', to: '/components/breadcrumbs', iconName: 'widget' },
      { label: 'Stepper', to: '/components/stepper', iconName: 'widget' },
      { label: 'CommandPalette', to: '/components/command-palette', iconName: 'search' },
    ],
  },
  {
    title: 'Feedback',
    items: [
      { label: 'Alert', to: '/components/alerts', iconName: 'shield-check' },
      { label: 'Toast', to: '/components/toast', iconName: 'widget' },
      { label: 'Tooltip', to: '/components/tooltips', iconName: 'widget' },
    ],
  },
  {
    title: 'Layout & Overlays',
    items: [
      { label: 'Separator', to: '/components/separator', iconName: 'widget' },
      { label: 'Accordion', to: '/components/accordions', iconName: 'widget' },
      { label: 'Sheet', to: '/components/sheet', iconName: 'widget' },
      { label: 'Dialog', to: '/components/dialog', iconName: 'widget' },
      { label: 'Popover', to: '/components/popover', iconName: 'widget' },
    ],
  },
]

const isActive = (to: string) => route.path === to
</script>

<template>
  <div
    class="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-100 flex min-h-screen flex-col"
  >
    <div class="flex flex-1">
      <!-- Mobile sidebar toggle -->
      <button
        class="bg-primary-500 fixed inset-e-4 bottom-4 z-50 rounded-full p-3 text-white shadow-lg lg:hidden"
        @click="sidebarOpen = !sidebarOpen"
      >
        <span :class="[resolveIcon('sidebar'), 'h-5 w-5']" />
      </button>

      <!-- Sidebar overlay (mobile) -->
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-40 bg-black/30 lg:hidden"
        @click="sidebarOpen = false"
      />

      <!-- Sidebar -->
      <aside
        :class="[
          'fixed inset-y-0 inset-s-0 z-40 w-64 shrink-0 overflow-y-auto pt-16',
          'border-surface-200/80 dark:border-surface-700/60 border-e',
          'dark:bg-surface-900/96 bg-white/96',
          'transition-transform duration-300 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0',
          sidebarOpen
            ? 'translate-x-0'
            : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
        ]"
      >
        <nav class="space-y-6 p-4">
          <RouterLink
            to="/components"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="
              route.path === '/components'
                ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : 'text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400'
            "
            @click="sidebarOpen = false"
          >
            Overview
          </RouterLink>

          <div v-for="cat in categories" :key="cat.title">
            <h3
              class="text-surface-400 dark:text-surface-500 mb-1.5 px-3 text-[11px] font-semibold tracking-widest uppercase"
            >
              {{ cat.title }}
            </h3>
            <ul class="space-y-0.5">
              <li v-for="item in cat.items" :key="item.to">
                <RouterLink
                  :to="item.to"
                  :class="[
                    'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150',
                    isActive(item.to)
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
                  ]"
                  @click="sidebarOpen = false"
                >
                  {{ item.label }}
                </RouterLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="max-w-4xl min-w-0 flex-1 p-6 lg:p-10">
        <RouterView />
      </main>
    </div>
    <AppNotifications />
  </div>
</template>
