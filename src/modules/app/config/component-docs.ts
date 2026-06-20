export interface ComponentDemoDoc {
  path: string
  title: string
  group: string
  groupLabel: string
  groupOrder: number
  order: number
}

export const COMPONENTS_DOCS_OVERVIEW_PATH = '/docs/components/overview'

export const COMPONENT_DEMO_DOCS = [
  {
    path: 'buttons',
    title: 'Button',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 20,
  },
  {
    path: 'text-fields',
    title: 'TextField',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 21,
  },
  {
    path: 'textareas',
    title: 'Textarea',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 22,
  },
  {
    path: 'checkboxes',
    title: 'Checkbox',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 23,
  },
  {
    path: 'switches',
    title: 'Switch',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 24,
  },
  {
    path: 'radio-group',
    title: 'RadioGroup',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 25,
  },
  {
    path: 'selects',
    title: 'Select',
    group: 'forms',
    groupLabel: 'Forms',
    groupOrder: 2,
    order: 26,
  },
  {
    path: 'data-table',
    title: 'DataTable',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 1,
  },
  {
    path: 'badges',
    title: 'Badge',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 2,
  },
  {
    path: 'avatars',
    title: 'Avatar',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 3,
  },
  {
    path: 'cards',
    title: 'Card',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 4,
  },
  {
    path: 'progress',
    title: 'Progress',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 5,
  },
  {
    path: 'skeleton',
    title: 'Skeleton',
    group: 'data-display',
    groupLabel: 'Data Display',
    groupOrder: 5,
    order: 6,
  },
  {
    path: 'tabs',
    title: 'Tabs',
    group: 'navigation',
    groupLabel: 'Navigation',
    groupOrder: 6,
    order: 1,
  },
  {
    path: 'breadcrumbs',
    title: 'Breadcrumb',
    group: 'navigation',
    groupLabel: 'Navigation',
    groupOrder: 6,
    order: 2,
  },
  {
    path: 'stepper',
    title: 'Stepper',
    group: 'navigation',
    groupLabel: 'Navigation',
    groupOrder: 6,
    order: 3,
  },
  {
    path: 'command-palette',
    title: 'CommandPalette',
    group: 'navigation',
    groupLabel: 'Navigation',
    groupOrder: 6,
    order: 4,
  },
  {
    path: 'alerts',
    title: 'Alert',
    group: 'feedback',
    groupLabel: 'Feedback',
    groupOrder: 7,
    order: 1,
  },
  {
    path: 'toast',
    title: 'Toast',
    group: 'feedback',
    groupLabel: 'Feedback',
    groupOrder: 7,
    order: 2,
  },
  {
    path: 'tooltips',
    title: 'Tooltip',
    group: 'feedback',
    groupLabel: 'Feedback',
    groupOrder: 7,
    order: 3,
  },
  {
    path: 'separator',
    title: 'Separator',
    group: 'layout-overlays',
    groupLabel: 'Layout & Overlays',
    groupOrder: 8,
    order: 1,
  },
  {
    path: 'accordions',
    title: 'Accordion',
    group: 'layout-overlays',
    groupLabel: 'Layout & Overlays',
    groupOrder: 8,
    order: 2,
  },
  {
    path: 'sheet',
    title: 'Sheet',
    group: 'layout-overlays',
    groupLabel: 'Layout & Overlays',
    groupOrder: 8,
    order: 3,
  },
  {
    path: 'dialog',
    title: 'Dialog',
    group: 'layout-overlays',
    groupLabel: 'Layout & Overlays',
    groupOrder: 8,
    order: 4,
  },
  {
    path: 'popover',
    title: 'Popover',
    group: 'layout-overlays',
    groupLabel: 'Layout & Overlays',
    groupOrder: 8,
    order: 5,
  },
] as const satisfies readonly ComponentDemoDoc[]

export function buildComponentDemoDocSlug(path: string): string {
  return `components/demos/${path}`
}

export function buildComponentDemoDocsPath(path: string): string {
  return `/docs/${buildComponentDemoDocSlug(path)}`
}

const COMPONENT_DEMO_REDIRECTS = Object.fromEntries(
  COMPONENT_DEMO_DOCS.map((doc) => [doc.path, buildComponentDemoDocsPath(doc.path)]),
)

const LEGACY_COMPONENT_DOC_REDIRECTS: Readonly<Record<string, string>> = {
  '': COMPONENTS_DOCS_OVERVIEW_PATH,
  ...COMPONENT_DEMO_REDIRECTS,
  charts: '/docs/components/charts',
  'data-tables': '/docs/components/data-tables',
  forms: '/docs/components/forms',
  'forms/form-builder': '/docs/components/forms/form-builder',
  overview: COMPONENTS_DOCS_OVERVIEW_PATH,
}

export const LEGACY_COMPONENT_DOC_ROUTE_ENTRIES = Object.entries(
  LEGACY_COMPONENT_DOC_REDIRECTS,
).map(([legacySlug, target]) => ({
  path: legacySlug ? `/components/${legacySlug}` : '/components',
  target,
}))

export function resolveLegacyComponentsDocsPath(path: string): string | undefined {
  if (path !== '/components' && !path.startsWith('/components/')) return undefined

  const legacySlug = path.replace(/^\/components\/?/, '').replace(/\/$/, '')
  return LEGACY_COMPONENT_DOC_REDIRECTS[legacySlug] ?? COMPONENTS_DOCS_OVERVIEW_PATH
}
