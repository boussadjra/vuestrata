<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface ComponentCard {
  label: string
  description: string
  to: string
}

interface Category {
  title: string
  items: ComponentCard[]
}

const categories: Category[] = [
  {
    title: 'Forms',
    items: [
      {
        label: 'Button',
        description: 'Trigger actions with multiple variants, sizes, and states.',
        to: '/components/buttons',
      },
      {
        label: 'TextField',
        description: 'Single-line text input with label, hint, and validation.',
        to: '/components/text-fields',
      },
      {
        label: 'Textarea',
        description: 'Multi-line text input with resize control.',
        to: '/components/textareas',
      },
      {
        label: 'Checkbox',
        description: 'Binary toggle with indeterminate support.',
        to: '/components/checkboxes',
      },
      {
        label: 'Switch',
        description: 'Toggle control for on/off settings.',
        to: '/components/switches',
      },
      {
        label: 'RadioGroup',
        description: 'Select one option from a set.',
        to: '/components/radio-group',
      },
      {
        label: 'Select',
        description: 'Dropdown selection from a list of options.',
        to: '/components/selects',
      },
    ],
  },
  {
    title: 'Data Display',
    items: [
      {
        label: 'DataTable',
        description: 'Tabular data with sorting, selection, and custom cells.',
        to: '/components/data-table',
      },
      {
        label: 'Badge',
        description: 'Compact status indicators and labels.',
        to: '/components/badges',
      },
      {
        label: 'Avatar',
        description: 'User or entity representation with fallbacks.',
        to: '/components/avatars',
      },
      {
        label: 'Card',
        description: 'Content container with header, body, and footer slots.',
        to: '/components/cards',
      },
      {
        label: 'Progress',
        description: 'Determinate progress indicator with label.',
        to: '/components/progress',
      },
      {
        label: 'Skeleton',
        description: 'Placeholder loading states for content.',
        to: '/components/skeleton',
      },
    ],
  },
  {
    title: 'Navigation',
    items: [
      {
        label: 'Tabs',
        description: 'Organize content into switchable panels.',
        to: '/components/tabs',
      },
      {
        label: 'Breadcrumb',
        description: 'Hierarchical navigation trail.',
        to: '/components/breadcrumbs',
      },
      {
        label: 'Stepper',
        description: 'Multi-step process indicator with navigation.',
        to: '/components/stepper',
      },
      {
        label: 'CommandPalette',
        description: 'Searchable command launcher.',
        to: '/components/command-palette',
      },
    ],
  },
  {
    title: 'Feedback',
    items: [
      {
        label: 'Alert',
        description: 'Contextual feedback messages with variants.',
        to: '/components/alerts',
      },
      { label: 'Toast', description: 'Temporary notification popups.', to: '/components/toast' },
      {
        label: 'Tooltip',
        description: 'Contextual information on hover.',
        to: '/components/tooltips',
      },
    ],
  },
  {
    title: 'Layout & Overlays',
    items: [
      {
        label: 'Separator',
        description: 'Visual divider between content sections.',
        to: '/components/separator',
      },
      {
        label: 'Accordion',
        description: 'Collapsible content sections.',
        to: '/components/accordions',
      },
      {
        label: 'Sheet',
        description: 'Slide-out panel for contextual content.',
        to: '/components/sheet',
      },
      {
        label: 'Dialog',
        description: 'Modal overlay for focused interactions.',
        to: '/components/dialog',
      },
      {
        label: 'Popover',
        description: 'Floating content panel anchored to a trigger.',
        to: '/components/popover',
      },
    ],
  },
]
</script>

<template>
  <div>
    <h1 class="mb-2 text-3xl font-bold">{{ t('sidebar_components') }}</h1>
    <p class="text-surface-500 dark:text-surface-400 mb-10 text-lg">
      Explore all provider-agnostic UI components. Each works with both Reka UI and Vuetify&nbsp;0.
    </p>

    <div class="space-y-10">
      <section v-for="cat in categories" :key="cat.title">
        <h2
          class="text-surface-400 dark:text-surface-500 mb-4 text-sm font-semibold tracking-widest uppercase"
        >
          {{ cat.title }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="item in cat.items"
            :key="item.to"
            :to="item.to"
            class="group border-surface-200 dark:border-surface-700/60 dark:bg-surface-900 hover:border-primary-300 dark:hover:border-primary-700 rounded-xl border bg-white p-5 transition-all duration-200 hover:shadow-md"
          >
            <h3
              class="text-surface-900 dark:text-surface-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 text-sm font-semibold transition-colors"
            >
              {{ item.label }}
            </h3>
            <p class="text-surface-500 dark:text-surface-400 mt-1 text-xs leading-relaxed">
              {{ item.description }}
            </p>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
