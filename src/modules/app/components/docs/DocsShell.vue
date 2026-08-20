<script setup lang="ts">
import { Comark } from 'comark/vue'
import { defineAsyncComponent, defineComponent, h, type Component } from 'vue'

import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'
import { COMPONENT_DEMO_DOCS, buildComponentDemoDocSlug } from '@/config/component-docs'

import DocsContent from './DocsContent.vue'
import {
  buildSidebarSections,
  findActiveSidebarGroup,
  getGroupKey,
  type DocEntry,
} from './docsNavigation'
import DocsSidebar from './DocsSidebar.vue'

interface DocsMarkdownMetadata {
  title?: string
  navTitle?: string
  description?: string
}

const DOCS_MARKDOWN_METADATA: Record<string, DocsMarkdownMetadata> = {
  '/docs/index.md': {
    title: 'Vuestrata',
    description:
      'Vue 3 enterprise starter with adapter-driven UI, runtime provider switching, twelve themes, and typed API boundaries.',
  },
  '/docs/1.getting-started/1.installation.md': {
    title: 'Installation',
    description: 'Install Vuestrata and start developing.',
  },
  '/docs/1.getting-started/2.configuration.md': {
    title: 'Configuration',
    description: 'Environment variables and adapter configuration.',
  },
  '/docs/2.architecture/1.overview.md': {
    title: 'Architecture Overview',
    description: 'Current layered architecture, module ownership, and runtime flow.',
  },
  '/docs/2.architecture/2.adapters.md': {
    title: 'Adapter Systems',
    description: 'UI, icon, validation, and auth adapter patterns.',
  },
  '/docs/2.architecture/3.routing.md': {
    title: 'Routing System',
    description:
      'How Vuestrata combines file-based routes, module routes, layouts, and auth/RBAC guards.',
  },
  '/docs/3.modules/1.overview.md': {
    title: 'Module System Overview',
    description: 'App module architecture, boundaries, and runtime registration.',
  },
  '/docs/2.architecture/4.route-pages.md': {
    title: 'Route Pages',
    description: 'Pages are thin inbound adapters between Vue Router and the application.',
  },
  '/docs/3.modules/2.creating-a-module.md': {
    title: 'Creating a Module',
    description: 'Step-by-step guide to add a module in the current architecture.',
  },
  '/docs/3.modules/3.built-in-modules.md': {
    title: 'Built-in Modules',
    description: 'Reference for the currently shipped app modules.',
  },
  '/docs/3.modules/4.navigation.md': {
    title: 'Navigation',
    description: 'Sidebar groups, nested sections, breadcrumbs, and the command palette.',
  },
  '/docs/4.theming/1.overview.md': {
    title: 'Theming',
    description: 'Multi-theme system with dark mode support and custom themes.',
  },
  '/docs/4.theming/2.semantic-tokens.md': {
    title: 'Semantic Tokens',
    description:
      'The token contract every theme satisfies, and the rule that keeps components off raw palette values.',
  },
  '/docs/5.components/1.overview.md': {
    title: 'Components',
    navTitle: 'Overview',
    description: 'Overview of the Reka-based Ui wrapper components.',
  },
  '/docs/5.components/2.provider-architecture.md': {
    title: 'Ui Wrapper Architecture',
    description: 'Public Ui wrappers and shared base components.',
  },
  '/docs/5.components/3.data-tables.md': {
    title: 'Data Tables',
    description: 'TanStack Table integration with sorting, filtering, and pagination.',
  },
  '/docs/5.components/4.charts.md': {
    title: 'Charts',
    description: 'Theme-aware ECharts integration.',
  },
  '/docs/5.components/2.forms/index.md': {
    title: 'Forms Overview',
    description: 'Architecture, shell components, and common props for the Vuestrata form system.',
  },
  '/docs/5.components/2.forms/1.text-inputs.md': {
    title: 'Text Inputs',
    description:
      'UiTextField, UiSearchField, UiNumberField, and UiTextarea — single-line and multi-line text entry fields.',
  },
  '/docs/5.components/2.forms/2.choice-inputs.md': {
    title: 'Choice Inputs',
    description:
      'UiCheckbox, UiSwitch, UiToggle, UiRadioGroup, and UiToggleGroup — boolean and one-of-many selection fields.',
  },
  '/docs/5.components/2.forms/3.selection-inputs.md': {
    title: 'Selection Inputs',
    description:
      'UiSelect, UiComboBox, UiTagsField, UiTreeSelect, UiFileUpload, and UiOTPField — dropdown, search, and compound selection fields.',
  },
  '/docs/5.components/2.forms/4.date-time.md': {
    title: 'Date & Time',
    description:
      'Date, time, and calendar components — segmented editing, popup pickers, and range selection.',
  },
  '/docs/5.components/2.forms/5.specialized.md': {
    title: 'Specialized Inputs',
    description:
      'UiSlider, UiRangeSlider, UiColorPicker, UiEditable, UiMentionsField, UiRatingField, and UiSteppedForm.',
  },
  '/docs/5.components/2.forms/6.form-builder.md': {
    title: 'Form Builder',
    description:
      'Detailed form management with useFormBuilder(), UiFormBuilder, state handling, and validation.',
  },
  '/docs/5.components/5.dashboard.md': {
    title: 'Dashboard',
    description: 'The dashboard panels, the data they read, and how the charts are registered.',
  },
  '/docs/6.configuration/1.environment.md': {
    title: 'Environment',
    description: 'Environment variables and deployment configuration.',
  },
  '/docs/6.configuration/2.auth-rbac.md': {
    title: 'Auth & RBAC',
    description: 'Authentication strategies and role-based access control.',
  },
  '/docs/6.configuration/3.auth-deep-dive.md': {
    title: 'Auth & Authorization — Deep Dive',
    description:
      "End-to-end walkthrough of Vuestrata's authentication, session lifecycle, and RBAC engine, including the security rationale for each design choice.",
  },
  '/docs/7.testing/1.overview.md': {
    title: 'Testing',
    description: 'Unit testing with Vitest and end-to-end testing with Playwright.',
  },
  '/docs/7.testing/2.accessibility.md': {
    title: 'Accessibility Testing',
    description:
      'What the automated suite covers, what it cannot, and the manual checklist that fills the gap.',
  },
  '/docs/8.deployment/1.vercel-demo.md': {
    title: 'Vercel Demo',
    description: 'Deploying the public, backend-free demo.',
  },
  '/docs/8.deployment/2.real-production.md': {
    title: 'Real Production',
    description:
      'Deploying against a real backend, and every demo affordance that must be switched off first.',
  },
  '/docs/9.readiness.md': {
    title: 'Readiness',
    description: 'What is production-ready, what is a demo affordance, and what is still missing.',
  },
  '/docs/10.troubleshooting.md': {
    title: 'Troubleshooting',
    description: 'Failures this template produces on purpose, and what each one is telling you.',
  },
  '/docs/9.recipes/index.md': {
    title: 'Recipes',
    description:
      'Task-shaped guides for extending the template, with generators where they earn their place.',
  },
  '/docs/9.recipes/1.add-a-module.md': {
    navTitle: 'Add a module',
    title: 'Add a Module',
    description:
      'Scaffold a CRUD domain module, what the generator writes, and what is still yours to decide.',
  },
  '/docs/9.recipes/2.add-a-page.md': {
    navTitle: 'Add a page',
    title: 'Add a Page',
    description:
      'Add a page to an existing module, and why dropping a .vue file in pages/ is not enough.',
  },
  '/docs/9.recipes/3.add-a-theme.md': {
    navTitle: 'Add a theme',
    title: 'Add a Theme',
    description: 'Scaffold a theme, the four files that must agree, and the import-order trap.',
  },
  '/docs/9.recipes/4.add-a-component.md': {
    navTitle: 'Add a component',
    title: 'Add a Component',
    description:
      'Scaffold a Ui* wrapper, the wrapper/composable split, and the colour rule that will reject your code.',
  },
  '/docs/9.recipes/5.add-an-icon-set.md': {
    navTitle: 'Add an icon set',
    title: 'Add an Icon Set',
    description: 'Swap or add an icon provider without leaving gaps in the UI.',
  },
  '/docs/9.recipes/6.add-a-locale.md': {
    navTitle: 'Add a locale',
    title: 'Add a Locale',
    description: 'Add a language across the shell catalog, every module, and the RTL plumbing.',
  },
  '/docs/9.recipes/7.add-a-permission.md': {
    navTitle: 'Add a permission',
    title: 'Add a Permission',
    description: 'Declare a permission, grant it to roles, and guard routes and UI with it.',
  },
  '/docs/9.recipes/8.add-a-nav-group.md': {
    navTitle: 'Add a nav group',
    title: 'Add a Nav Group',
    description: 'Add a sidebar section — and why modules cannot define their own.',
  },
}

const markdownModules = import.meta.glob('/docs/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const componentDemoModules = import.meta.glob<Component>(
  '/src/modules/app/pages/components/**/*.vue',
  {
    import: 'default',
  },
) as Record<string, () => Promise<Component>>

function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  return match ? match[2]! : raw
}

function buildSlug(path: string): string {
  return path
    .replace('/docs/', '')
    .replace(/\.md$/, '')
    .replace(/^index$/, '')
    .replace(/\/index$/, '')
    .replace(/(\d+)\./g, '')
}

/** Where standalone `docs/*.md` pages land: one section, after the numbered ones. */
const TOP_LEVEL_SECTION = 'reference'
const TOP_LEVEL_SECTION_ORDER = 999

function extractOrder(segment: string): number {
  const match = segment.match(/^(\d+)\./)
  return match ? Number(match[1]) : 999
}

function getFallbackDocTitle(parts: string[]): string {
  return parts[parts.length - 1]!.replace(/^\d+\./, '').replace(/-/g, ' ')
}

function createMarkdownDocComponent(loadMarkdown: (() => Promise<string>) | undefined) {
  if (!loadMarkdown) return undefined

  return defineAsyncComponent({
    loader: async () => {
      const markdown = stripFrontmatter(await loadMarkdown())

      return defineComponent({
        name: 'DocsMarkdownContent',
        setup() {
          return () =>
            h(Comark, {
              markdown,
              components: docsComarkComponents,
              plugins: docsComarkPlugins,
            })
        },
      })
    },
    suspensible: true,
  })
}

function createDemoDocComponent(loadComponent: (() => Promise<Component>) | undefined) {
  if (!loadComponent) return undefined

  return defineAsyncComponent({
    loader: loadComponent,
    suspensible: true,
  })
}

const docs: DocEntry[] = []
const sections = new Map<string, { label: string; order: number }>()

for (const path of Object.keys(markdownModules)) {
  const metadata = DOCS_MARKDOWN_METADATA[path] ?? {}
  const relative = path.replace('/docs/', '')
  const parts = relative.replace(/\.md$/, '').split('/')

  let sectionOrder = 0
  let section = ''
  let order = 0
  let subsection: string | undefined
  let subsectionOrder: number | undefined

  if (parts.length === 1) {
    // `docs/index.md` is the root link rendered above the sections. Every
    // other top-level page — readiness, troubleshooting — fell through with
    // `section: ''`, and `buildSidebarSections` drops those, so the page
    // existed at its URL and appeared in no sidebar anywhere.
    if (parts[0] === 'index') {
      sectionOrder = -1
    } else {
      section = TOP_LEVEL_SECTION
      sectionOrder = TOP_LEVEL_SECTION_ORDER
      order = extractOrder(parts[0]!)

      if (!sections.has(section))
        sections.set(section, { label: TOP_LEVEL_SECTION, order: sectionOrder })
    }
  } else if (parts.length === 2) {
    const sectionDir = parts[0]!
    sectionOrder = extractOrder(sectionDir)
    section = sectionDir.replace(/^\d+\./, '')
    // A section's own `index.md` leads it. Without this it takes the
    // no-numeric-prefix fallback of 999 and sorts *after* every page it
    // introduces — which is how "Recipes" ended up below all eight recipes.
    order = parts[1] === 'index' ? 0 : extractOrder(parts[1]!)

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
    title: metadata.navTitle || metadata.title || getFallbackDocTitle(parts),
    description: metadata.description || '',
    content: '',
    order,
    section,
    sectionOrder,
    subsection,
    subsectionOrder,
    component: createMarkdownDocComponent(markdownModules[path]),
  })
}

for (const demo of COMPONENT_DEMO_DOCS) {
  const component = createDemoDocComponent(
    componentDemoModules[`/src/modules/app/pages/components/${demo.path}.vue`],
  )
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
const { open: sidebarOpen, close: closeSidebar } = useDocsSidebar()
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
  closeSidebar()
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
      @toggle-group="toggleGroup"
      @close="closeSidebar"
    />

    <DocsContent :doc="currentDoc" @back="navigateTo('')" />
  </div>
</template>
