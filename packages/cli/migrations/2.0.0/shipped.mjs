import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashContents } from '../../src/lib/plan.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Project-owned examples upgraded only when they match a released copy. */
export const PROJECT_FILES = [
  'src/main.ts',
  'vite.config.ts',
  'src/modules/customers/pages/index.vue',
  'src/modules/orders/pages/index.vue',
  'src/modules/users/pages/users.vue',
  'src/modules/users/components/UsersScreen.vue',
  'src/modules/users/composables/useUsersTable.ts',
  'src/modules/auth/components/AccountGrantsGrid.vue',
  'src/modules/showcase/pages/tables.vue',
  'src/modules/app/pages/components/data-table.vue',
  'src/modules/app/components/docs/DocsComponentShowcase.vue',
  ...[
    'DataTableDemo',
    'DataTableEmptyDemo',
    'DataTableErrorDemo',
    'DataTableMinimalDemo',
    'DataTablePublicApiDemo',
    'DataTableRichDemo',
    'DataTableServerDemo',
    'DataTableTypedCellsDemo',
    'DataTableSelectionDemo',
    'DataTableVirtualDemo',
    'DataTableTreeDemo',
  ].map((name) => `src/modules/app/components/docs/demos/${name}.vue`),
]

/** New feature files accompany a pristine route or workflow; never overwrite project work. */
export const COMPANIONS = {
  'src/modules/customers/pages/index.vue': [
    'src/modules/customers/components/CustomersScreen.vue',
    'src/modules/customers/query-model.ts',
  ],
  'src/modules/orders/pages/index.vue': [
    'src/modules/orders/components/OrdersScreen.vue',
    'src/modules/orders/query-model.ts',
  ],
  'src/modules/users/pages/users.vue': ['src/modules/users/query-model.ts'],
}

export const SHIPPED_FILES = [...new Set([...PROJECT_FILES, ...Object.values(COMPANIONS).flat()])]

export function shippedCopy(rel) {
  return fs.readFileSync(path.join(here, 'shipped', `${rel}.txt`), 'utf8').replaceAll('\r\n', '\n')
}

export function isShipped(rel, contents) {
  return hashContents(contents) === hashContents(shippedCopy(rel))
}

/** Current copies belong to 2.0; historical migrations remain frozen. */
export function checkShipped({ repoRoot = path.resolve(here, '../../../..'), write = false } = {}) {
  const stale = []
  for (const rel of SHIPPED_FILES) {
    const current = fs.readFileSync(path.join(repoRoot, rel), 'utf8').replaceAll('\r\n', '\n')
    const target = path.join(here, 'shipped', `${rel}.txt`)
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === current) continue
    stale.push(rel)
    if (write) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, current)
    }
  }
  return stale
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write')
  const stale = checkShipped({ write })
  if (stale.length && !write) {
    process.stderr.write(`[migration 2.0.0] stale shipped copies: ${stale.join(', ')}\n`)
    process.stderr.write('Refresh with: node packages/cli/migrations/2.0.0/shipped.mjs --write\n')
    process.exitCode = 1
  } else {
    process.stdout.write(
      `[migration 2.0.0] ${write ? 'refreshed' : 'checked'} ${SHIPPED_FILES.length} project files.\n`,
    )
  }
}
