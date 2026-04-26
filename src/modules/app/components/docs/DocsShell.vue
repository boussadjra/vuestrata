<script setup lang="ts">
import { Comark } from 'comark/vue'

import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'

const markdownModules = import.meta.glob('/docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

interface DocEntry {
  slug: string
  title: string
  description: string
  content: string
  order: number
  section: string
  sectionOrder: number
  subsection?: string
  subsectionOrder?: number
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
    title: attrs.title || parts[parts.length - 1]!.replace(/^\d+\./, '').replace(/-/g, ' '),
    description: attrs.description || '',
    content: body,
    order,
    section,
    sectionOrder,
    subsection,
    subsectionOrder,
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

watch(
  currentSlug,
  () => {
    const active = docs.find((d) => d.slug === currentSlug.value)
    if (active?.subsection) expandedGroups.value.add(active.subsection)
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

      const subsGroups = new Map<string, SubsectionGroup>()
      for (const doc of sectionDocs.filter((d) => d.subsection)) {
        if (!subsGroups.has(doc.subsection!)) {
          subsGroups.set(doc.subsection!, {
            key: doc.subsection!,
            label: doc.subsection!.replace(/-/g, ' '),
            order: doc.subsectionOrder!,
            items: [],
          })
        }
        subsGroups.get(doc.subsection!)!.items.push(doc)
      }

      for (const group of subsGroups.values()) group.items.sort((a, b) => a.order - b.order)

      const groupEntries: SidebarEntry[] = [...subsGroups.values()].map((g) => ({
        kind: 'group' as const,
        group: g,
        order: g.order,
      }))

      const entries = [...regularItems, ...groupEntries].sort((a, b) => a.order - b.order)

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
      class="bg-primary-500 fixed right-4 bottom-4 z-40 rounded-full p-3 text-white shadow-lg lg:hidden"
      @click="sidebarOpen = !sidebarOpen"
    >
      <span class="i-solar-hamburger-menu-bold h-5 w-5" />
    </button>

    <aside
      :class="[
        'border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-64 shrink-0 border-r bg-white',
        'overflow-y-auto p-4 lg:sticky lg:top-0 lg:h-full',
        'fixed inset-y-16 left-0 z-30 lg:relative lg:inset-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        'transition-transform duration-200',
      ]"
    >
      <button
        :class="[
          'mb-4 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors',
          currentSlug === ''
            ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
            : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800',
        ]"
        @click="navigateTo('')"
      >
        Documentation
      </button>

      <nav>
        <div v-for="section in sortedSections" :key="section.key" class="mb-4">
          <h3
            class="text-surface-700 dark:text-surface-300 mb-1 px-3 text-xs font-bold tracking-wider uppercase"
          >
            {{ section.label }}
          </h3>
          <ul class="space-y-0.5">
            <template
              v-for="entry in section.entries"
              :key="entry.kind === 'item' ? entry.doc.slug : entry.group.key"
            >
              <li v-if="entry.kind === 'item'">
                <button
                  :class="[
                    'ml-2 w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
                    isActive(entry.doc.slug)
                      ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800',
                  ]"
                  @click="navigateTo(entry.doc.slug)"
                >
                  {{ entry.doc.title }}
                </button>
              </li>
              <li v-else>
                <button
                  class="text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors"
                  @click="toggleGroup(entry.group.key)"
                >
                  <span class="font-medium capitalize">{{ entry.group.label }}</span>
                  <span
                    :class="[
                      'text-[10px] transition-transform duration-200',
                      expandedGroups.has(entry.group.key) ? 'rotate-90' : '',
                    ]"
                    >&#9654;</span
                  >
                </button>
                <ul
                  v-if="expandedGroups.has(entry.group.key)"
                  class="border-surface-200 dark:border-surface-700 mt-0.5 ml-3 space-y-0.5 border-l"
                >
                  <li v-for="sub in entry.group.items" :key="sub.slug">
                    <button
                      :class="[
                        'w-full rounded-r-lg py-1.5 pr-3 pl-3 text-left text-sm transition-colors',
                        isActive(sub.slug)
                          ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 border-primary-500 -ml-px border-l-2 font-medium'
                          : 'text-surface-500 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
                      ]"
                      @click="navigateTo(sub.slug)"
                    >
                      {{ sub.title }}
                    </button>
                  </li>
                </ul>
              </li>
            </template>
          </ul>
        </div>
      </nav>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-20 bg-black/30 lg:hidden"
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
          <Comark
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
