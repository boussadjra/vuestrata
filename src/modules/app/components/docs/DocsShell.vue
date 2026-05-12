<script setup lang="ts">
import type { Component } from 'vue'

import { COMPONENT_DEMO_DOCS, buildComponentDemoDocSlug } from '@/config/component-docs'

import DocsContent from './DocsContent.vue'
import {
  buildSidebarSections,
  findActiveSidebarGroup,
  getGroupKey,
  type DocEntry,
} from './docsNavigation'
import DocsSidebar from './DocsSidebar.vue'

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
const sidebarSections = computed(() => buildSidebarSections(docs))

const currentSlug = computed(() => {
  const slugParam = (route.params as Record<string, string | string[]>).slug
  if (!slugParam) return ''
  return Array.isArray(slugParam) ? slugParam.join('/') : slugParam
})

const currentDoc = computed(() => {
  const matchedDoc = docs.find((doc) => doc.slug === currentSlug.value)
  if (matchedDoc) return matchedDoc
  return currentSlug.value ? undefined : rootDoc
})

const expandedGroups = ref(new Set<string>())

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key)
  else expandedGroups.value.add(key)
}

function closeSidebar() {
  sidebarOpen.value = false
}

watch(
  currentSlug,
  () => {
    const activeGroup = findActiveSidebarGroup(sidebarSections.value, currentSlug.value)
    if (activeGroup) {
      expandedGroups.value.add(activeGroup.key)
      return
    }

    const activeDoc = docs.find((doc) => doc.slug === currentSlug.value)
    if (activeDoc?.subsection) {
      expandedGroups.value.add(getGroupKey(activeDoc.section, activeDoc.subsection))
    }
  },
  { immediate: true },
)

function navigateTo(slug: string) {
  sidebarOpen.value = false
  router.push(slug ? `/docs/${slug}` : '/docs')
}
</script>

<template>
  <div class="flex h-full min-h-0">
    <DocsSidebar
      :sections="sidebarSections"
      :current-slug="currentSlug"
      :open="sidebarOpen"
      :expanded-groups="expandedGroups"
      @toggle-open="sidebarOpen = !sidebarOpen"
      @toggle-group="toggleGroup"
      @close="closeSidebar"
    />

    <DocsContent :doc="currentDoc" @back="navigateTo('')" />
  </div>
</template>
