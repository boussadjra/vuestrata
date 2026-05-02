<script setup lang="ts">
import { Comark } from 'comark/vue'
import type { Component } from 'vue'

import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'
import { COMPONENT_DEMO_DOCS, buildComponentDemoDocSlug } from '@/config/component-docs'

const markdownModules = import.meta.glob('/docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const componentDemoModules = import.meta.glob<Component>(
  '/src/modules/app/pages/components/**/*.vue',
  {
    import: 'default',
    eager: true,
  },
)

interface DocEntry {
  slug: string
  title: string
  description: string
  content: string
  order: number
  section: string
  sectionOrder: number
  subsection?: string
  subsectionLabel?: string
  subsectionOrder?: number
  component?: Component
}

interface SubsectionGroup {
  key: string
  label: string
  order: number
  items: DocEntry[]
}

type SidebarEntry =
  | { kind: 'item'; doc: DocEntry; order: number }
  | { kind: 'group'; group: SubsectionGroup; order: number }

function parseFrontmatter(raw: string): { attrs: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { attrs: {}, body: raw }

  const attrs: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) attrs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }

  return { attrs, body: match[2]! }
}

function buildSlug(path: string): string {
  return path
    .replace('/docs/', '')
    .replace(/\.md$/, '')
    .replace(/^index$/, '')
    .replace(/\/index$/, '')
    .replace(/(\d+)\./g, '')
}

function extractOrder(segment: string): number {
  const match = segment.match(/^(\d+)\./)
  return match ? Number(match[1]) : 999
}

const docs: DocEntry[] = []
const sections = new Map<string, { label: string; order: number }>()

for (const [path, raw] of Object.entries(markdownModules)) {
  const { attrs, body } = parseFrontmatter(raw)
  const relative = path.replace('/docs/', '')
  const parts = relative.replace(/\.md$/, '').split('/')

  let sectionOrder = 0
  let section = ''
  let order = 0
  let subsection: string | undefined
  let subsectionOrder: number | undefined

  if (parts.length === 1) {
    sectionOrder = -1
  } else if (parts.length === 2) {
    const sectionDir = parts[0]!
    sectionOrder = extractOrder(sectionDir)
    section = sectionDir.replace(/^\d+\./, '')
    order = extractOrder(parts[1]!)

    if (!sections.has(section))
      sections.set(section, { label: section.replace(/-/g, ' '), order: sectionOrder })
  } else {
    const sectionDir = parts[0]!
    sectionOrder = extractOrder(sectionDir)
    section = sectionDir.replace(/^\d+\./, '')
    const subsectionDir = parts[1]!
    subsectionOrder = extractOrder(subsectionDir)
    subsection = subsectionDir.replace(/^\d+\./, '')
    const itemPart = parts[parts.length - 1]!
    order = itemPart === 'index' ? 0 : extractOrder(itemPart)

    if (!sections.has(section))
      sections.set(section, { label: section.replace(/-/g, ' '), order: sectionOrder })
  }

  docs.push({
    slug: buildSlug(path),
    title:
      attrs.navTitle ||
      attrs.title ||
      parts[parts.length - 1]!.replace(/^\d+\./, '').replace(/-/g, ' '),
    description: attrs.description || '',
    content: body,
    order,
    section,
    sectionOrder,
    subsection,
    subsectionOrder,
  })
}

for (const demo of COMPONENT_DEMO_DOCS) {
  const component = componentDemoModules[`/src/modules/app/pages/components/${demo.path}.vue`]
  if (!component) continue

  docs.push({
    slug: buildComponentDemoDocSlug(demo.path),
    title: demo.title,
    description: `${demo.title} component demo`,
    content: '',
    order: demo.order,
    section: 'components',
    sectionOrder: 5,
    subsection: demo.group,
    subsectionLabel: demo.groupLabel,
    subsectionOrder: demo.groupOrder,
    component,
  })
}

const rootDoc = docs.find((doc) => doc.slug === '')
const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)

const currentSlug = computed(() => {
  const slugParam = (route.params as Record<string, string | string[]>).slug
  if (!slugParam) return ''
  return Array.isArray(slugParam) ? slugParam.join('/') : slugParam
})

const currentDoc = computed(() => docs.find((doc) => doc.slug === currentSlug.value) || rootDoc)

const expandedGroups = ref(new Set<string>())

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key)
  else expandedGroups.value.add(key)
}

function getGroupKey(section: string, subsection: string) {
  return `${section}/${subsection}`
}

function getGroupPanelId(key: string) {
  return `docs-sidebar-group-${key.replace(/[^a-z0-9_-]/gi, '-')}`
}

function isGroupExpanded(key: string) {
  return expandedGroups.value.has(key)
}

function isGroupActive(group: SubsectionGroup) {
  return group.items.some((doc) => isActive(doc.slug))
}

function closeSidebar() {
  sidebarOpen.value = false
}

function getSidebarEntrySortTier(sectionKey: string, entry: SidebarEntry) {
  if (sectionKey !== 'components') return 0
  if (entry.kind === 'item' && entry.doc.slug === 'components/overview') return 0
  if (entry.kind === 'group') return 1
  return 2
}

function getSidebarEntryLabel(entry: SidebarEntry) {
  return entry.kind === 'item' ? entry.doc.title : entry.group.label
}

function sortSidebarEntries(sectionKey: string, left: SidebarEntry, right: SidebarEntry) {
  const leftTier = getSidebarEntrySortTier(sectionKey, left)
  const rightTier = getSidebarEntrySortTier(sectionKey, right)
  if (leftTier !== rightTier) return leftTier - rightTier

  const orderDiff = left.order - right.order
  if (orderDiff !== 0) return orderDiff

  return getSidebarEntryLabel(left).localeCompare(getSidebarEntryLabel(right))
}

watch(
  currentSlug,
  () => {
    const active = docs.find((d) => d.slug === currentSlug.value)
    if (active?.subsection) expandedGroups.value.add(getGroupKey(active.section, active.subsection))
  },
  { immediate: true },
)

const sortedSections = computed(() => {
  return [...sections.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const sectionDocs = docs.filter((doc) => doc.section === section.key)

      const regularItems: SidebarEntry[] = sectionDocs
        .filter((doc) => !doc.subsection)
        .map((doc) => ({ kind: 'item' as const, doc, order: doc.order }))

      const labelOverrides = new Map<string, string>()
      for (const doc of sectionDocs) {
        if (doc.subsection && doc.subsectionLabel)
          labelOverrides.set(getGroupKey(section.key, doc.subsection), doc.subsectionLabel)
      }

      const subsGroups = new Map<string, SubsectionGroup>()
      for (const doc of sectionDocs.filter((d) => d.subsection)) {
        const groupKey = getGroupKey(section.key, doc.subsection!)
        if (!subsGroups.has(groupKey)) {
          subsGroups.set(groupKey, {
            key: groupKey,
            label: labelOverrides.get(groupKey) ?? doc.subsection!.replace(/-/g, ' '),
            order: doc.subsectionOrder!,
            items: [],
          })
        }
        subsGroups.get(groupKey)!.items.push(doc)
      }

      for (const group of subsGroups.values()) group.items.sort((a, b) => a.order - b.order)

      const groupEntries: SidebarEntry[] = [...subsGroups.values()].map((g) => ({
        kind: 'group' as const,
        group: g,
        order: g.order,
      }))

      const entries = [...regularItems, ...groupEntries].sort((left, right) =>
        sortSidebarEntries(section.key, left, right),
      )

      return { ...section, entries }
    })
})

function navigateTo(slug: string) {
  sidebarOpen.value = false
  router.push(slug ? `/docs/${slug}` : '/docs')
}

function isActive(slug: string) {
  return currentSlug.value === slug
}
</script>

<template>
  <div class="flex h-full">
    <button
      type="button"
      class="bg-primary-500 focus-visible:ring-primary-300 fixed right-4 bottom-4 z-40 rounded-full p-3 text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:hidden"
      aria-controls="docs-sidebar"
      aria-label="Toggle documentation navigation"
      :aria-expanded="sidebarOpen"
      @click="sidebarOpen = !sidebarOpen"
    >
      <span class="i-solar-hamburger-menu-bold h-5 w-5" aria-hidden="true" />
    </button>

    <aside
      id="docs-sidebar"
      aria-label="Documentation sidebar"
      :class="[
        'border-surface-200/80 dark:border-surface-700 dark:bg-surface-900/98 w-72 shrink-0 border-r bg-white/98 shadow-xl shadow-black/5 lg:shadow-none',
        'overflow-y-auto p-4 lg:sticky lg:top-0 lg:h-full',
        'fixed inset-y-16 left-0 z-30 lg:relative lg:inset-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        'transition-transform duration-200',
      ]"
      @keydown.esc="closeSidebar"
    >
      <RouterLink
        to="/docs"
        :class="[
          'focus-visible:ring-primary-300 mb-4 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
          currentSlug === ''
            ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
            : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
        ]"
        :aria-current="currentSlug === '' ? 'page' : undefined"
        @click="closeSidebar"
      >
        Documentation
      </RouterLink>

      <nav aria-label="Documentation" class="space-y-5">
        <section v-for="section in sortedSections" :key="section.key">
          <h2
            :id="`docs-section-${section.key}`"
            class="text-surface-500 dark:text-surface-400 mb-2 px-3 text-xs font-bold tracking-wider uppercase"
          >
            {{ section.label }}
          </h2>
          <ul class="space-y-1" :aria-labelledby="`docs-section-${section.key}`">
            <template
              v-for="entry in section.entries"
              :key="entry.kind === 'item' ? entry.doc.slug : entry.group.key"
            >
              <li v-if="entry.kind === 'item'">
                <RouterLink
                  :to="entry.doc.slug ? `/docs/${entry.doc.slug}` : '/docs'"
                  :class="[
                    'focus-visible:ring-primary-300 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    isActive(entry.doc.slug)
                      ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 font-semibold'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                  ]"
                  :aria-current="isActive(entry.doc.slug) ? 'page' : undefined"
                  @click="closeSidebar"
                >
                  {{ entry.doc.title }}
                </RouterLink>
              </li>
              <li v-else>
                <button
                  type="button"
                  :aria-expanded="isGroupExpanded(entry.group.key)"
                  :aria-controls="getGroupPanelId(entry.group.key)"
                  :class="[
                    'focus-visible:ring-primary-300 flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    isGroupActive(entry.group)
                      ? 'bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                  ]"
                  @click="toggleGroup(entry.group.key)"
                >
                  <span class="font-semibold">{{ entry.group.label }}</span>
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
                  class="border-surface-200 dark:border-surface-700 mt-1 ml-3 space-y-1 border-l pl-2"
                >
                  <li v-for="sub in entry.group.items" :key="sub.slug">
                    <RouterLink
                      :to="`/docs/${sub.slug}`"
                      :class="[
                        'focus-visible:ring-primary-300 flex min-h-9 w-full items-center rounded-lg border-l-2 border-transparent px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        isActive(sub.slug)
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300 font-semibold'
                          : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                      ]"
                      :aria-current="isActive(sub.slug) ? 'page' : undefined"
                      @click="closeSidebar"
                    >
                      {{ sub.title }}
                    </RouterLink>
                  </li>
                </ul>
              </li>
            </template>
          </ul>
        </section>
      </nav>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-20 bg-black/30 lg:hidden"
      aria-hidden="true"
      @click="sidebarOpen = false"
    />

    <main
      class="bg-surface-50/60 dark:bg-surface-950 min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-4"
    >
      <article
        v-if="currentDoc"
        class="docs-content dark:border-surface-800 mx-auto max-w-6xl rounded py-8"
      >
        <Suspense>
          <component v-if="currentDoc.component" :is="currentDoc.component" />
          <Comark
            v-else
            :markdown="currentDoc.content"
            :components="docsComarkComponents"
            :plugins="docsComarkPlugins"
          />
          <template #fallback>
            <div class="text-surface-400 flex items-center gap-2 py-12">
              <span class="i-solar-refresh-bold-duotone h-5 w-5 animate-spin" />
              Loading...
            </div>
          </template>
        </Suspense>
      </article>

      <div v-else class="text-surface-500 py-20 text-center">
        <p class="text-lg">Page not found</p>
        <button class="text-primary-500 mt-4 hover:underline" @click="navigateTo('')">
          Back to docs
        </button>
      </div>
    </main>
  </div>
</template>
