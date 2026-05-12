<script setup lang="ts">
import { UiButton } from '@/components/ui'

import { getGroupPanelId, type SidebarSection, type SubsectionGroup } from './docsNavigation'

const props = defineProps<{
  sections: SidebarSection[]
  currentSlug: string
  open: boolean
  expandedGroups: Set<string>
}>()

const emit = defineEmits<{
  close: []
  toggleOpen: []
  toggleGroup: [key: string]
}>()

function isActive(slug: string) {
  return props.currentSlug === slug
}

function isGroupExpanded(key: string) {
  return props.expandedGroups.has(key)
}

function isGroupActive(group: SubsectionGroup) {
  return group.items.some((doc) => isActive(doc.slug))
}

function closeSidebar() {
  emit('close')
}

const itemLinkClass =
  'focus-visible:ring-primary-300 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-8 lg:py-1.5'

const childLinkClass =
  'focus-visible:ring-primary-300 flex min-h-9 w-full items-center rounded-lg py-2 pr-3 pl-4 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-8 lg:py-1.5'
</script>

<template>
  <UiButton
    variant="primary"
    size="lg"
    icon
    class="fixed inset-e-4 bottom-4 z-40 rounded-full lg:hidden"
    aria-controls="docs-sidebar"
    aria-label="Toggle documentation navigation"
    :aria-expanded="open"
    @click="emit('toggleOpen')"
  >
    <span class="i-solar-hamburger-menu-bold h-5 w-5" aria-hidden="true" />
  </UiButton>

  <aside
    id="docs-sidebar"
    aria-label="Documentation sidebar"
    :class="[
      'border-surface-200/80 bg-surface-50/98 dark:border-surface-700 dark:bg-surface-900/98 min-h-0 w-72 shrink-0 border-e shadow-(--shadow-elevated) lg:shadow-none',
      'overflow-y-auto p-4 lg:sticky lg:top-0 lg:h-full',
      'fixed inset-y-16 inset-s-0 z-30 lg:relative lg:inset-auto',
      open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
      'transition-transform duration-200',
    ]"
    @keydown.esc="closeSidebar"
  >
    <RouterLink
      to="/docs"
      :class="[
        itemLinkClass,
        'mb-3 font-semibold',
        currentSlug === ''
          ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
          : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
      ]"
      :aria-current="currentSlug === '' ? 'page' : undefined"
      @click="closeSidebar"
    >
      Documentation
    </RouterLink>

    <nav aria-label="Documentation" class="space-y-4 lg:space-y-3">
      <section v-for="section in sections" :key="section.key">
        <h2
          :id="`docs-section-${section.key}`"
          class="text-surface-500 dark:text-surface-400 mb-2 px-3 text-xs font-bold tracking-wider uppercase"
        >
          {{ section.label }}
        </h2>

        <ul class="list-none space-y-1 p-0" :aria-labelledby="`docs-section-${section.key}`">
          <li
            v-for="entry in section.entries"
            :key="entry.kind === 'item' ? entry.doc.slug : entry.group.key"
          >
            <RouterLink
              v-if="entry.kind === 'item'"
              :to="entry.doc.slug ? `/docs/${entry.doc.slug}` : '/docs'"
              :class="[
                itemLinkClass,
                isActive(entry.doc.slug)
                  ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
              ]"
              :aria-current="isActive(entry.doc.slug) ? 'page' : undefined"
              @click="closeSidebar"
            >
              {{ entry.doc.title }}
            </RouterLink>

            <template v-else>
              <button
                type="button"
                :class="[
                  itemLinkClass,
                  'justify-between font-semibold',
                  isGroupActive(entry.group)
                    ? 'bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100'
                    : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-100',
                ]"
                :aria-expanded="isGroupExpanded(entry.group.key)"
                :aria-controls="getGroupPanelId(entry.group.key)"
                @click="emit('toggleGroup', entry.group.key)"
              >
                <span class="min-w-0 truncate">{{ entry.group.label }}</span>
                <span
                  :class="[
                    'i-solar-alt-arrow-right-linear h-4 w-4 shrink-0 transition-transform duration-200',
                    isGroupExpanded(entry.group.key) ? 'rotate-90' : '',
                  ]"
                  aria-hidden="true"
                />
              </button>

              <ul
                v-show="isGroupExpanded(entry.group.key)"
                :id="getGroupPanelId(entry.group.key)"
                class="border-surface-200 dark:border-surface-700 ms-6 mt-1 list-none space-y-1 border-s p-0"
              >
                <li v-for="sub in entry.group.items" :key="sub.slug">
                  <RouterLink
                    :to="`/docs/${sub.slug}`"
                    :class="[
                      childLinkClass,
                      isActive(sub.slug)
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300 font-semibold'
                        : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                    ]"
                    :aria-current="isActive(sub.slug) ? 'page' : undefined"
                    @click="closeSidebar"
                  >
                    {{ sub.title }}
                  </RouterLink>
                </li>
              </ul>
            </template>
          </li>
        </ul>
      </section>
    </nav>
  </aside>

  <div
    v-if="open"
    class="fixed inset-0 z-20 bg-black/30 lg:hidden"
    aria-hidden="true"
    @click="closeSidebar"
  />
</template>
