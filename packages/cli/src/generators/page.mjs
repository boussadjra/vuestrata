import fs from 'node:fs'
import path from 'node:path'

import { inSlot, slot } from '../lib/manifest.mjs'
import { camel, kebab, pascal, title } from '../lib/naming.mjs'

/**
 * Add a page to an existing module.
 *
 * A module page is not file-routed — `vite.config.ts` scans only
 * `app/pages` and `auth/pages`. Domain pages reach the router through their
 * module's `routes` array, which is also what applies the layout wrapper and
 * the RBAC meta. Dropping a `.vue` file into `src/modules/<id>/pages/` and
 * expecting a URL is therefore a very easy mistake, and the reason this
 * generator edits the barrel rather than only writing a file.
 *
 * Route ordering matters too: a static segment must be registered before a
 * dynamic sibling or the dynamic one swallows it. The insertion point is chosen
 * accordingly, and module-contract.test.ts asserts the result.
 */
const KINDS = new Set(['list', 'detail', 'form', 'blank'])

export function planPage({ plan, root, positional, options }) {
  const [moduleId, rawName] = positional
  if (!moduleId || !rawName) {
    throw new Error('usage: vpr gen:page <module> <name> [--kind list|detail|form|blank]')
  }

  const id = kebab(moduleId)
  const moduleDir = path.join(root, slot(plan.manifest, 'modulesDir'), id)
  const barrelPath = path.join(moduleDir, 'index.ts')

  if (!fs.existsSync(barrelPath)) {
    throw new Error(
      `module "${id}" does not exist (looked for src/modules/${id}/index.ts). ` +
        'Create it first with `vpr gen:module`.',
    )
  }

  const kind = options.kind ?? 'blank'
  if (!KINDS.has(kind)) {
    throw new Error(`unknown --kind "${kind}". Expected one of: ${[...KINDS].join(', ')}`)
  }

  const name = kebab(rawName)
  const Label = title(rawName)
  const titleKey = `${id}_${camel(name)}_title`
  const routePath = kind === 'detail' ? `/dashboard/${id}/${name}/:id` : `/dashboard/${id}/${name}`

  plan.addFile(
    inSlot(plan.manifest, 'modulesDir', id, 'pages', `${name}.vue`),
    pageTemplate({ id, name, kind, titleKey }),
    { own: 'seeded' },
  )

  plan.addEdit(
    inSlot(plan.manifest, 'modulesDir', id, 'index.ts'),
    `add the ${name} route`,
    (source) =>
      insertRoute(source, {
        id,
        name,
        routePath,
        titleKey,
        isDynamic: routePath.includes(':'),
      }),
  )

  if (options.nav) {
    plan.addEdit(
      inSlot(plan.manifest, 'modulesDir', id, 'index.ts'),
      `add a nav item for ${name}`,
      (source) =>
        insertNavItem(source, { id, name, routePath, titleKey, icon: options.icon ?? 'widget' }),
    )
  }

  for (const locale of ['en', 'fr', 'ar']) {
    const rel = inSlot(plan.manifest, 'modulesDir', id, 'i18n', `${locale}.json`)
    plan.addEdit(rel, `add "${titleKey}"`, (source) => addLocaleKey(source, titleKey, Label))
  }

  plan.addNote(
    `The page is reachable at ${routePath}. It inherits the module's \`${id}:read\` permission — ` +
      'change `requiredPermission` on the new route if it needs a different one.',
  )

  return plan
}

/**
 * Insert the route before the first dynamic (`:param`) sibling if there is one,
 * otherwise at the end of the array. vue-router matches equally-ranked paths in
 * registration order, so a static path declared after `/:id` is unreachable.
 */
function insertRoute(source, { id, name, routePath, titleKey, isDynamic }) {
  const record = `    {
      path: '${routePath}',
      name: '${routePath}',
      component: () => import('./pages/${name}.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: '${id}:read',
        module: '${id}',
        title: '${titleKey}',
      },
    },
`

  if (source.includes(`path: '${routePath}'`)) return source

  const routesStart = source.indexOf('routes: [')
  if (routesStart === -1) throw new Error('no `routes: [` array found in the module barrel')

  const routesEnd = source.indexOf('\n  ],', routesStart)
  if (routesEnd === -1) throw new Error('could not find the end of the `routes` array')

  let insertAt = routesEnd + 1

  if (!isDynamic) {
    // Land ahead of the first dynamic sibling so it cannot swallow this path.
    const block = source.slice(routesStart, routesEnd)
    const dynamic = /\n(\s*)\{\n\s*path: '[^']*:[^']*'/.exec(block)
    if (dynamic) insertAt = routesStart + dynamic.index + 1
  }

  return source.slice(0, insertAt) + record + source.slice(insertAt)
}

function insertNavItem(source, { name, routePath, titleKey, icon }) {
  if (source.includes(`to: '${routePath}'`)) return source

  const navStart = source.indexOf('navItems: [')
  if (navStart === -1) throw new Error('no `navItems: [` array found in the module barrel')

  const navEnd = source.indexOf('\n  ],', navStart)
  if (navEnd === -1) throw new Error('could not find the end of the `navItems` array')

  const item = `    {
      label: '${titleKey}',
      icon: '${icon}',
      to: '${routePath}',
      order: 60,
    },
`
  void name
  return source.slice(0, navEnd + 1) + item + source.slice(navEnd + 1)
}

/** Append a key to a flat locale JSON, preserving 2-space formatting. */
function addLocaleKey(source, key, value) {
  const parsed = JSON.parse(source)
  if (key in parsed) return source
  parsed[key] = value
  return `${JSON.stringify(parsed, null, 2)}\n`
}

function pageTemplate({ id, name, kind, titleKey }) {
  if (kind === 'detail') {
    return `<script setup lang="ts">
/**
 * A route page: a thin inbound adapter. It reads route state and renders;
 * queries and mutations belong in the module's composables/.
 */
const { t } = useI18n()
const route = useRoute()

const id = computed(() => String(route.params.id))
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('${titleKey}')" />
    <UiCard class="p-6">
      <p class="text-muted-foreground">{{ id }}</p>
    </UiCard>
  </div>
</template>
`
  }

  if (kind === 'form') {
    return `<script setup lang="ts">
const { t } = useI18n()
const router = useRouter()

async function handleSubmit() {
  // Call a mutation from ../composables/ here, then navigate.
  await router.push('/dashboard/${id}')
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('${titleKey}')" />
    <UiCard class="p-6">
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <UiButton type="submit">{{ t('common_save') }}</UiButton>
      </form>
    </UiCard>
  </div>
</template>
`
  }

  if (kind === 'list') {
    const Entities = pascal(id)
    return `<script setup lang="ts">
/**
 * A route page: a thin inbound adapter. Wire the module's list query into
 * \`useServerTable\` — see customers/pages/index.vue.
 */
import { createColumns } from '@/composables/useDataTable'
import { useServerTable } from '@/composables/useServerTable'

import { use${Entities}Query } from '../composables/use${Entities}'

const { t } = useI18n()
const col = createColumns<{ id: string; name: string }>()
const columns = computed(() => [
  col.text('name', { label: t('${titleKey}') }),
])

const { table, isLoading, isError, refetch } = useServerTable({
  columns,
  query: use${Entities}Query,
})
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('${titleKey}')" />
    <UiDataGrid
      :table="table"
      :loading="isLoading"
      :error="isError"
      :aria-label="t('${titleKey}')"
      @retry="refetch"
    />
  </div>
</template>
`
  }

  return `<script setup lang="ts">
const { t } = useI18n()
void '${name}'
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('${titleKey}')" />
  </div>
</template>
`
}
