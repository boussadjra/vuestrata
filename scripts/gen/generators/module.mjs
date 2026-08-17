import { insertBeforeSentinel, insertImport, SENTINELS } from '../lib/registry.mjs'

/**
 * Scaffold a CRUD domain module.
 *
 * Modelled directly on `src/modules/customers/` — the reference implementation.
 * Everything it emits is wired through the same shared machinery the existing
 * domains use (`createCollectionApi`, `createCollectionMock`,
 * `defineQueryKeys`), so a generated module is not a special case: it is the
 * same module the docs describe, typed out for you.
 *
 * What it deliberately does NOT do:
 *   - invent domain fields. The schema gets a small, honest starting shape and
 *     a comment telling you it is yours to replace. A generator that guesses at
 *     a `Payment` having a `currency` and a `refundedAt` produces code that
 *     looks finished and is wrong.
 *   - grant the new permissions to any role. That is an access-control
 *     decision, and silently handing `super_admin` a new capability is not the
 *     generator's call to make.
 */
export function planModule({ plan, names, options }) {
  const n = names
  const dir = `src/modules/${n.moduleId}`
  const nav = options.navGroup ?? 'work'
  const icon = options.icon ?? 'widget'

  plan.addFile(`${dir}/types.ts`, typesTemplate(n))
  plan.addFile(`${dir}/query-keys.ts`, queryKeysTemplate(n))
  plan.addFile(`${dir}/presentation.ts`, presentationTemplate(n))
  plan.addFile(`${dir}/composables/use${n.Entities}.ts`, composablesTemplate(n))
  plan.addFile(`${dir}/mocks/fixtures.ts`, fixturesTemplate(n))
  plan.addFile(`${dir}/mocks/${n.moduleId}.handlers.ts`, handlersTemplate(n))
  plan.addFile(`${dir}/pages/index.vue`, listPageTemplate(n))
  plan.addFile(`${dir}/pages/detail.vue`, detailPageTemplate(n))
  plan.addFile(`${dir}/pages/form.vue`, formPageTemplate(n))
  plan.addFile(`${dir}/index.ts`, barrelTemplate(n, { nav, icon }))

  for (const locale of ['en', 'fr', 'ar']) {
    plan.addFile(`${dir}/i18n/${locale}.json`, localeTemplate(n, locale))
  }

  plan.addEdit('src/modules/setup.ts', `import ${n.entities}Module`, (source) =>
    insertImport(source, `import ${n.entities}Module from './${n.moduleId}'`, {
      matching: /^import \w+Module from '\.\//,
    }),
  )

  plan.addEdit('src/modules/setup.ts', `register ${n.entities}Module in appModules`, (source) =>
    insertBeforeSentinel(source, SENTINELS.modules, `${n.entities}Module,`),
  )

  // `BuiltinPermission` is a closed union, so a module's own permissions must
  // be declared there before its routes can reference them. Without this the
  // module does not compile — which is the type system doing its job, but it
  // is not something the generator should leave for a human to discover.
  plan.addEdit(
    'src/modules/core/lib/rbac/types.ts',
    `declare '${n.moduleId}:read' and '${n.moduleId}:manage'`,
    (source) => {
      let next = insertBeforeSentinel(source, SENTINELS.permissions, `| '${n.moduleId}:read'`)
      next = insertBeforeSentinel(next, SENTINELS.permissions, `| '${n.moduleId}:manage'`)
      return next
    },
  )

  plan.addNote(
    `Replace the placeholder fields in ${dir}/types.ts with the real ${n.EntityLabel} shape — ` +
      'the schema drives the mock, the queries and the form.',
  )
  plan.addNote(
    `Grant '${n.moduleId}:read' / '${n.moduleId}:manage' to whichever roles should have them in ` +
      'src/modules/core/lib/rbac/inheritance.ts. Until you do, only the permissions already ' +
      'held by a role apply and the pages stay inaccessible.',
  )
  plan.addNote(
    `Translate ${dir}/i18n/fr.json and ar.json — they ship with English copy so the ` +
      'i18n-parity lint rule passes; leaving them is a silent English fallback.',
  )

  return plan
}

const header = (n, body) => `/**\n * ${body}\n */\n`

/** Stable small integer from the module id, so fixtures are reproducible. */
function hashSeed(value) {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 100000
  return hash
}

function typesTemplate(n) {
  return `import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'

${header(
  n,
  `${n.EntityLabel} contract.
 *
 * The same schema is used by the mock handler to build responses and by the
 * query composable to validate them, so the two cannot drift. Point the app at
 * a real backend and this file becomes the contract you agree with it.
 *
 * GENERATED STARTING POINT — the fields below are a placeholder shape, not a
 * guess at your domain. Replace them with the real ones; everything else in the
 * module follows from this file.`,
)}
export const ${n.ENTITY}_STATUSES = ['draft', 'active', 'archived'] as const
export type ${n.Entity}Status = (typeof ${n.ENTITY}_STATUSES)[number]

export const ${n.entity}Schema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(${n.ENTITY}_STATUSES),
  /** ISO timestamp. */
  createdAt: z.string(),
  /** Free-text notes. Empty is normal, not an error. */
  notes: z.string(),
})

export type ${n.Entity} = z.infer<typeof ${n.entity}Schema>

export interface ${n.Entity}Filters extends CollectionFilters {
  status?: ${n.Entity}Status | 'all'
}

/** Fields a form may submit. Server-owned fields are deliberately absent. */
export const ${n.entity}DraftSchema = ${n.entity}Schema.pick({
  name: true,
  status: true,
  notes: true,
})

export type ${n.Entity}Draft = z.infer<typeof ${n.entity}DraftSchema>
`
}

function queryKeysTemplate(n) {
  return `import { defineQueryKeys } from '~/lib/query-keys'

/** ${n.Label} module query keys. Server state only. */
export const ${n.entities}ModuleKeys = defineQueryKeys('${n.moduleId}')
`
}

function presentationTemplate(n) {
  return `${header(
    n,
    `${n.EntityLabel} presentation rules.
 *
 * The status→badge mapping is a property of the domain, not of a particular
 * route: the list and the record page must agree about what "archived" looks
 * like, and a shared map is what stops them agreeing only by coincidence.
 *
 * The badge colour reinforces the label; it never carries the meaning alone
 * (WCAG 1.4.1) — every consumer renders the translated status text as well.`,
  )}
import type { ${n.Entity}Status } from './types'

export type ${n.Entity}StatusVariant = 'success' | 'warning' | 'error' | 'default'

const STATUS_VARIANT: Record<${n.Entity}Status, ${n.Entity}StatusVariant> = {
  active: 'success',
  draft: 'default',
  archived: 'warning',
}

export function ${n.entity}StatusVariant(status: ${n.Entity}Status): ${n.Entity}StatusVariant {
  return STATUS_VARIANT[status]
}
`
}

function composablesTemplate(n) {
  return `import { createCollectionApi } from '~/lib/api/collection-queries'

import { ${n.entities}ModuleKeys } from '../query-keys'
import { ${n.entity}Schema, type ${n.Entity}, type ${n.Entity}Draft, type ${n.Entity}Filters } from '../types'

${header(
  n,
  `${n.Label} server state.
 *
 * \`createCollectionApi\` supplies list/detail/create/update/delete against the
 * shared \`{ data, meta }\` collection contract, with the response validated by
 * the zod schema at the boundary. Pagination plumbing is not reimplemented per
 * domain — if you need behaviour it does not cover, add a composable beside
 * this one rather than forking the factory.`,
)}
const ${n.entities}Api = createCollectionApi<${n.Entity}, ${n.Entity}Filters, ${n.Entity}Draft, ${n.Entity}Draft>({
  resource: '${n.moduleId}',
  schema: ${n.entity}Schema,
  keys: ${n.entities}ModuleKeys,
})

export const use${n.Entities}Query = ${n.entities}Api.useList
export const use${n.Entity}Query = ${n.entities}Api.useDetail
export const useCreate${n.Entity}Mutation = ${n.entities}Api.useCreate
export const useUpdate${n.Entity}Mutation = ${n.entities}Api.useUpdate
export const useDelete${n.Entity}Mutation = ${n.entities}Api.useRemove
`
}

function fixturesTemplate(n) {
  return `${header(
    n,
    `Seeded ${n.Label.toLowerCase()}.
 *
 * Deterministic: the same list on every reload, in every browser, so a
 * screenshot or an e2e assertion stays valid. \`Math.random()\` is banned here
 * for that reason — use the seeded helpers from ~/mocks/seed.`,
  )}
import { createRng, daysFromNow, pick, sequentialId } from '~/mocks/seed'

import { ${n.ENTITY}_STATUSES, type ${n.Entity} } from '../types'

const RECORD_COUNT = 24

/** Any fixed integer works — it only has to be the SAME one on every run. */
const SEED = ${hashSeed(n.moduleId)}

export const ${n.entity}Fixtures: ${n.Entity}[] = (() => {
  const rng = createRng(SEED)

  return Array.from({ length: RECORD_COUNT }, (_, index) => ({
    id: sequentialId('${n.ENTITY.slice(0, 3)}', index),
    name: \`${n.EntityLabel} \${index + 1}\`,
    status: pick(rng, [...${n.ENTITY}_STATUSES]),
    createdAt: daysFromNow(-(index * 3 + 1)),
    notes: '',
  }))
})()
`
}

function handlersTemplate(n) {
  return `${header(
    n,
    `${n.Label} mock backend — demo builds only.
 *
 * Loaded through the module's \`mockHandlers\` factory, which is a dynamic
 * \`import()\`. A static import here would pull \`msw\` into the module barrel's
 * graph and therefore into real production bundles — the exact regression
 * scripts/build/verify-bundle.mjs exists to catch.`,
  )}
import { createCollectionMock } from '~/mocks/collection'

import { ${n.entity}DraftSchema, type ${n.Entity} } from '../types'
import { ${n.entity}Fixtures } from './fixtures'

const ${n.entities}Mock = createCollectionMock<${n.Entity}>({
  resource: '${n.moduleId}',
  seed: ${n.entity}Fixtures,
  searchFields: ['name', 'notes'],
  filterFields: ['status'],
  defaultSort: { by: 'name', order: 'asc' },

  create: (body, existing) => {
    // Validated with the same schema the form uses, so the mock rejects exactly
    // what a correct backend would rather than accepting anything and letting
    // the bug surface later as a malformed row.
    const parsed = ${n.entity}DraftSchema.safeParse(body)
    if (!parsed.success) return null

    return {
      ...parsed.data,
      id: \`${n.ENTITY.slice(0, 3)}-\${1000 + existing.length}\`,
      createdAt: new Date().toISOString(),
    }
  },

  update: (record, body) => {
    const parsed = ${n.entity}DraftSchema.partial().safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

export const ${n.entities}Handlers = ${n.entities}Mock.handlers
export const reset${n.Entities}Mock = ${n.entities}Mock.reset
`
}

function listPageTemplate(n) {
  return `<script setup lang="ts">
${header(
  n,
  `${n.Label} list — a route page, and therefore a thin inbound adapter.
 *
 * It reads route state, calls the module's query composable and renders. Any
 * business rule, mutation or cache invalidation belongs in composables/ — see
 * AGENTS.md, which the no-restricted-imports lint rule now enforces.
 *
 * Search and pagination are server-side: \`useList\` turns the filter ref into
 * query parameters. Fetching everything and filtering in the browser is the
 * thing this pattern exists to avoid.`,
)}
import { useI18n } from 'vue-i18n'

import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSkeleton,
  UiTextField,
} from '@/components/ui'

import { use${n.Entities}Query } from '../composables/use${n.Entities}'
import { ${n.entity}StatusVariant } from '../presentation'
import type { ${n.Entity}Filters } from '../types'

const { t } = useI18n()

const search = ref('')
const filters = computed<${n.Entity}Filters>(() => ({
  page: 1,
  pageSize: 20,
  search: search.value,
}))

const { items, isPending, isError } = use${n.Entities}Query(filters)
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('${n.moduleId}_nav')" :description="t('${n.moduleId}_description')">
      <template #actions>
        <UiButton to="/dashboard/${n.moduleId}/new">{{ t('${n.moduleId}_new_title') }}</UiButton>
      </template>
    </UiPageHeader>

    <UiTextField v-model="search" :label="t('common_search')" name="search" />

    <UiSkeleton v-if="isPending" class="h-64" />

    <UiEmptyState v-else-if="isError" :title="t('common_error')" />

    <UiEmptyState
      v-else-if="items.length === 0"
      :title="t('${n.moduleId}_empty_title')"
      :description="t('${n.moduleId}_empty_description')"
    />

    <UiCard v-else>
      <ul class="divide-border divide-y">
        <li v-for="record in items" :key="record.id" class="flex items-center gap-4 p-4">
          <RouterLink
            :to="\`/dashboard/${n.moduleId}/\${record.id}\`"
            class="text-foreground font-medium hover:underline"
          >
            {{ record.name }}
          </RouterLink>
          <UiBadge :variant="${n.entity}StatusVariant(record.status)">
            {{ t(\`${n.moduleId}_status_\${record.status}\`) }}
          </UiBadge>
        </li>
      </ul>
    </UiCard>
  </div>
</template>
`
}

function detailPageTemplate(n) {
  return `<script setup lang="ts">
${header(
  n,
  `${n.EntityLabel} record page.
 *
 * Three states, kept distinct: pending, not-found, and loaded. A 404 is not a
 * transient error and must not offer "retry" — the record is gone, and the only
 * useful action is to go back to the list.`,
)}
import { useI18n } from 'vue-i18n'

import { UiBadge, UiButton, UiCard, UiEmptyState, UiPageHeader, UiSkeleton } from '@/components/ui'
import { useRouteParam } from '@/composables/useRouteParam'

import { use${n.Entity}Query } from '../composables/use${n.Entities}'
import { ${n.entity}StatusVariant } from '../presentation'

const { t } = useI18n()

// Module routes are registered at runtime, so they are absent from the
// generated route map and \`route.params.id\` does not type-check here.
// \`useRouteParam\` holds that cast once, with the reason attached.
const id = useRouteParam('id')
const { item, isPending, isError } = use${n.Entity}Query(id)
</script>

<template>
  <div class="space-y-6">
    <UiSkeleton v-if="isPending" class="h-48" />

    <UiEmptyState v-else-if="isError || !item" :title="t('common_not_found')" />

    <template v-else>
      <UiPageHeader :title="item.name">
        <template #actions>
          <UiButton :to="\`/dashboard/${n.moduleId}/\${item.id}/edit\`" variant="secondary">
            {{ t('common_edit') }}
          </UiButton>
        </template>
      </UiPageHeader>

      <UiCard class="space-y-4 p-6">
        <UiBadge :variant="${n.entity}StatusVariant(item.status)">
          {{ t(\`${n.moduleId}_status_\${item.status}\`) }}
        </UiBadge>
        <p v-if="item.notes" class="text-muted-foreground">{{ item.notes }}</p>
      </UiCard>
    </template>
  </div>
</template>
`
}

function formPageTemplate(n) {
  return `<script setup lang="ts">
${header(
  n,
  `Create and edit in one page.
 *
 * Both routes point here; the presence of an \`:id\` param is what distinguishes
 * them. Two nearly identical files drift — this one cannot.`,
)}
import { useI18n } from 'vue-i18n'

import { UiButton, UiCard, UiPageHeader, UiSelect, UiTextField, UiTextarea } from '@/components/ui'
import { useRouteParam } from '@/composables/useRouteParam'

import {
  useCreate${n.Entity}Mutation,
  useUpdate${n.Entity}Mutation,
  use${n.Entity}Query,
} from '../composables/use${n.Entities}'
import { ${n.ENTITY}_STATUSES, type ${n.Entity}Draft } from '../types'

const { t } = useI18n()
const router = useRouter()

const id = useRouteParam('id')
const isEdit = computed(() => Boolean(id.value))

// \`useDetail\` accepts \`string | undefined\` and stays idle while it is
// undefined, so the create route issues no request.
const { item: existing } = use${n.Entity}Query(id)

const draft = ref<${n.Entity}Draft>({ name: '', status: 'draft', notes: '' })

watch(existing, (record) => {
  if (record) draft.value = { name: record.name, status: record.status, notes: record.notes }
})

const create = useCreate${n.Entity}Mutation()
const update = useUpdate${n.Entity}Mutation()

// Rebuilt when the locale changes: a \`const\` computed once would keep the
// language the page first loaded in.
const statusOptions = computed(() =>
  ${n.ENTITY}_STATUSES.map((status) => ({
    value: status,
    label: t(\`${n.moduleId}_status_\${status}\`),
  })),
)

async function handleSubmit() {
  const currentId = id.value
  if (currentId) {
    await update.mutateAsync({ id: currentId, patch: draft.value })
  } else {
    await create.mutateAsync(draft.value)
  }
  await router.push('/dashboard/${n.moduleId}')
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      :title="isEdit ? t('${n.moduleId}_edit_title') : t('${n.moduleId}_new_title')"
    />

    <UiCard class="p-6">
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <UiTextField v-model="draft.name" :label="t('common_name')" name="name" required />
        <UiSelect
          v-model="draft.status"
          :label="t('common_status')"
          :options="statusOptions"
          name="status"
        />
        <UiTextarea v-model="draft.notes" :label="t('common_notes')" name="notes" />

        <div class="flex gap-3">
          <UiButton type="submit">{{ t('common_save') }}</UiButton>
          <UiButton :to="'/dashboard/${n.moduleId}'" variant="ghost">
            {{ t('common_cancel') }}
          </UiButton>
        </div>
      </form>
    </UiCard>
  </div>
</template>
`
}

function barrelTemplate(n, { nav, icon }) {
  return `import type { ModuleDefinition } from '../types'
import ${n.entities}I18nAr from './i18n/ar.json'
import ${n.entities}I18nEn from './i18n/en.json'
import ${n.entities}I18nFr from './i18n/fr.json'

${header(
  n,
  `${n.Label} Module
 *
 * Public API (importable via barrel \`~/modules/${n.moduleId}\`):
 *   - use${n.Entities}Query / use${n.Entity}Query and the three mutations
 *   - ${n.entities}ModuleKeys, ${n.Entity}, ${n.Entity}Filters, ${n.Entity}Draft
 *
 * Cross-module imports must come through this file. Anything not exported here
 * is an internal, and deliberately so — the barrel is the public API, not an
 * index of every file.`,
)}
const ${n.entities}Module: ModuleDefinition = {
  config: {
    id: '${n.moduleId}',
    name: '${n.Label}',
    description: '${n.Label} records',
    version: '1.0.0',
    category: '${nav}',
    order: 50,
    enabledByDefault: true,
    permissions: ['${n.moduleId}:read', '${n.moduleId}:manage'],
  },

  routes: [
    {
      path: '/dashboard/${n.moduleId}',
      name: '/dashboard/${n.moduleId}',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: '${n.moduleId}:read',
        module: '${n.moduleId}',
        title: '${n.moduleId}_nav',
      },
    },
    // \`new\` is declared BEFORE \`:id\`. vue-router matches in registration order
    // for equally-ranked paths, and the dynamic segment would otherwise swallow
    // it — the create page would try to load a record with the id "new".
    {
      path: '/dashboard/${n.moduleId}/new',
      name: '/dashboard/${n.moduleId}/new',
      component: () => import('./pages/form.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: '${n.moduleId}:manage',
        module: '${n.moduleId}',
        title: '${n.moduleId}_new_title',
      },
    },
    {
      path: '/dashboard/${n.moduleId}/:id/edit',
      name: '/dashboard/${n.moduleId}/:id/edit',
      component: () => import('./pages/form.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: '${n.moduleId}:manage',
        module: '${n.moduleId}',
        title: '${n.moduleId}_edit_title',
      },
    },
    {
      path: '/dashboard/${n.moduleId}/:id',
      name: '/dashboard/${n.moduleId}/:id',
      component: () => import('./pages/detail.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: '${n.moduleId}:read',
        module: '${n.moduleId}',
        title: '${n.moduleId}_nav',
      },
    },
  ],

  navItems: [
    {
      label: '${n.moduleId}_nav',
      icon: '${icon}',
      to: '/dashboard/${n.moduleId}',
      permission: '${n.moduleId}:read',
      group: '${nav}',
      order: 50,
    },
  ],

  // The property itself is conditional, not just its body. Declaring
  // \`mockHandlers\` unconditionally keeps the arrow function — and therefore the
  // dynamic \`import()\` — in the barrel's graph, and rolldown emits the msw
  // chunk for a production build that can never call it.
  ...(__VUESTRATA_DEMO__
    ? {
        mockHandlers: async () =>
          (await import('./mocks/${n.moduleId}.handlers')).${n.entities}Handlers,
      }
    : {}),

  i18n: {
    en: ${n.entities}I18nEn,
    fr: ${n.entities}I18nFr,
    ar: ${n.entities}I18nAr,
  },
}

export default ${n.entities}Module

// ─── Public API barrel ──────────────────────────────────
export {
  use${n.Entities}Query,
  use${n.Entity}Query,
  useCreate${n.Entity}Mutation,
  useUpdate${n.Entity}Mutation,
  useDelete${n.Entity}Mutation,
} from './composables/use${n.Entities}'
export { ${n.entities}ModuleKeys } from './query-keys'
export { ${n.ENTITY}_STATUSES, ${n.entity}Schema, ${n.entity}DraftSchema } from './types'
export type { ${n.Entity}, ${n.Entity}Draft, ${n.Entity}Filters, ${n.Entity}Status } from './types'
`
}

/**
 * All three locales ship with English copy.
 *
 * The alternative — omitting fr/ar keys until someone translates them — trips
 * the i18n-parity rule on the very first `vp check` after generating, which
 * teaches people to ignore that rule. English placeholders keep the gate
 * meaningful and make the untranslated state visible in the UI instead.
 */
function localeTemplate(n, locale) {
  const messages = {
    [`${n.moduleId}_nav`]: n.Label,
    [`${n.moduleId}_description`]: `Manage ${n.Label.toLowerCase()}`,
    [`${n.moduleId}_new_title`]: `New ${n.EntityLabel}`,
    [`${n.moduleId}_edit_title`]: `Edit ${n.EntityLabel}`,
    [`${n.moduleId}_empty_title`]: `No ${n.Label.toLowerCase()} yet`,
    [`${n.moduleId}_empty_description`]: `Create your first ${n.EntityLabel.toLowerCase()} to get started.`,
    [`${n.moduleId}_status_draft`]: 'Draft',
    [`${n.moduleId}_status_active`]: 'Active',
    [`${n.moduleId}_status_archived`]: 'Archived',
  }

  // No "TODO: translate" marker key: it would exist in fr/ar and not in en,
  // which is precisely the asymmetry the i18n-parity rule fails on. The
  // reminder lives in the generator's output notes instead.
  void locale
  return `${JSON.stringify(messages, null, 2)}\n`
}
