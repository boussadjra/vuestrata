import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { solarIconMap } from '@/icons/maps/solar'
import enShell from '@/locales/en.json'
import { NAV_GROUPS } from '@/modules/nav-groups'
import { appModules } from '@/modules/setup'
import type { ModuleDefinition, ModuleNavItem } from '@/modules/types'
import { BUILTIN_PERMISSIONS } from '@/state/runtime-backends'

/**
 * The module contract, asserted mechanically.
 *
 * `ModuleDefinition` makes a module almost entirely declarative, which is what
 * makes it scaffoldable — but TypeScript only checks the *shape* of those
 * declarations, never their meaning. Every failure below is one an agent (or a
 * person) hits by writing a module that compiles perfectly and then does not
 * work, with no error anywhere:
 *
 *   - an unknown `meta.layout` logs a warning and registers the route WITHOUT
 *     a layout, so the page renders bare inside no shell
 *   - an unknown `navItems[].group` silently falls back to `overview`, so the
 *     link appears under the wrong heading
 *   - a mistyped `icon` renders an empty span
 *   - a `meta.title` that is not a real i18n key renders as the key itself
 *   - a dynamic route declared before its static sibling swallows it, so
 *     `/customers/new` tries to load a customer with the id "new"
 *
 * None of these throw. All of them are caught here.
 */

const ROOT = process.cwd()
const MODULES_DIR = path.join(ROOT, 'src/modules')
const ROUTER_FILE = path.join(ROOT, 'src/modules/app/plugins/router.ts')
const TYPED_ROUTER_FILE = path.join(ROOT, 'typed-router.d.ts')

const ICON_NAMES = new Set(Object.keys(solarIconMap))
const NAV_GROUP_IDS = new Set(NAV_GROUPS.map((group) => group.id))
const PERMISSIONS = new Set<string>(BUILTIN_PERMISSIONS)
const SHELL_KEYS = new Set(Object.keys(enShell))

/**
 * Layout names are read from the router source rather than imported: importing
 * `plugins/router.ts` calls `createRouter()` at module scope and drags the
 * whole generated route table plus NProgress into a unit test. The keys are a
 * flat object literal, so reading them is stable.
 */
const LAYOUT_NAMES = (() => {
  const source = fs.readFileSync(ROUTER_FILE, 'utf8')
  const start = source.indexOf('export const layoutMap')
  if (start === -1) throw new Error('Could not find `layoutMap` in plugins/router.ts')
  const open = source.indexOf('{', start)
  const close = source.indexOf('\n}', open)
  const block = source.slice(open, close)
  return new Set([...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]))
})()

/**
 * Every path the router can serve: module-contributed routes plus the
 * file-based ones in `typed-router.d.ts`. A nav item may legitimately link
 * across that boundary — `showcase` points at the docs pages, which the app
 * shell owns — so both halves are needed to tell a cross-link from a typo.
 */
const ALL_ROUTE_PATHS = (() => {
  const paths = new Set<string>()
  for (const mod of appModules) {
    for (const route of mod.routes ?? []) paths.add(route.path)
  }
  const typed = fs.readFileSync(TYPED_ROUTER_FILE, 'utf8')
  // Second type argument of RouteRecordInfo<name, path, …> is the real path.
  for (const match of typed.matchAll(/RouteRecordInfo<\s*'[^']*',\s*'([^']*)'/g)) {
    if (match[1]) paths.add(match[1])
  }
  return paths
})()

/** Catch-all file routes such as `/docs/:slug(.*)`, as matchers. */
const CATCH_ALL_MATCHERS = [...ALL_ROUTE_PATHS]
  .filter((routePath) => routePath.includes('(.*)'))
  .map((routePath) => new RegExp(`^${routePath.replace(/:\w+\(\.\*\)/g, '.*')}$`))

function isKnownRoutePath(to: string): boolean {
  if (ALL_ROUTE_PATHS.has(to)) return true
  return CATCH_ALL_MATCHERS.some((matcher) => matcher.test(to))
}

/** Every nav item, including nested children, flattened for iteration. */
function flattenNavItems(items: ModuleNavItem[] | undefined): ModuleNavItem[] {
  if (!items) return []
  return items.flatMap((item) => [item, ...flattenNavItems(item.children)])
}

/** Does `key` resolve in this module's own catalog, or in the shell catalog? */
function resolvesI18nKey(mod: ModuleDefinition, key: string): boolean {
  if (SHELL_KEYS.has(key)) return true
  const en = mod.i18n?.en
  return Boolean(en && key in en)
}

describe('module contract', () => {
  it('registers at least one module', () => {
    expect(appModules.length).toBeGreaterThan(0)
  })

  it('has unique, kebab-case ids that match their directory', () => {
    const seen = new Set<string>()
    for (const mod of appModules) {
      const { id } = mod.config
      expect(id, `module id "${id}" is not kebab-case`).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(seen.has(id), `duplicate module id "${id}"`).toBe(false)
      seen.add(id)
      expect(
        fs.existsSync(path.join(MODULES_DIR, id)),
        `module "${id}" has no directory at src/modules/${id}`,
      ).toBe(true)
    }
  })

  describe.each(appModules.map((mod) => [mod.config.id, mod] as const))('%s', (id, mod) => {
    const routes = mod.routes ?? []
    const navItems = flattenNavItems(mod.navItems)

    it('declares complete config metadata', () => {
      expect(mod.config.name.trim()).not.toBe('')
      expect(mod.config.description.trim()).not.toBe('')
      expect(mod.config.version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it.runIf(routes.length > 0)('declares routes that can actually render', () => {
      for (const route of routes) {
        expect(
          route.path.startsWith('/'),
          `${id}: route path "${route.path}" must be absolute`,
        ).toBe(true)

        // `name` mirroring `path` is the convention across every module; it is
        // what makes a route greppable from the URL alone.
        expect(route.name, `${id}: route name should mirror its path`).toBe(route.path)

        const layout = route.meta?.layout
        if (layout) {
          expect(
            LAYOUT_NAMES.has(layout),
            `${id}: route "${route.path}" declares layout "${layout}", which is not in layoutMap ` +
              `(known: ${[...LAYOUT_NAMES].join(', ')}). The route would register with no layout wrapper.`,
          ).toBe(true)
        }

        expect(
          route.meta?.module,
          `${id}: route "${route.path}" should tag meta.module with its owning module`,
        ).toBe(id)
      }
    })

    it.runIf(routes.length > 0)('orders static path segments before dynamic siblings', () => {
      // vue-router matches equally-ranked paths in registration order, so
      // `/x/:id` declared before `/x/new` swallows `/x/new`.
      const dynamicPrefixes: { path: string; prefix: string }[] = []

      for (const route of routes) {
        const segments = route.path.split('/')
        const dynamicAt = segments.findIndex((segment) => segment.startsWith(':'))

        if (dynamicAt !== -1) {
          dynamicPrefixes.push({ path: route.path, prefix: segments.slice(0, dynamicAt).join('/') })
          continue
        }

        for (const earlier of dynamicPrefixes) {
          expect(
            route.path.startsWith(`${earlier.prefix}/`),
            `${id}: static route "${route.path}" is declared AFTER dynamic route ` +
              `"${earlier.path}", which will swallow it. Move the static route first.`,
          ).toBe(false)
        }
      }
    })

    it.runIf(routes.length > 0)('guards routes with permissions the app knows about', () => {
      const declared = new Set(mod.config.permissions ?? [])
      for (const route of routes) {
        const required = [
          route.meta?.requiredPermission,
          ...(route.meta?.requiredPermissions ?? []),
        ].filter(Boolean) as string[]

        for (const permission of required) {
          expect(
            declared.has(permission) || PERMISSIONS.has(permission),
            `${id}: route "${route.path}" requires "${permission}", which is neither declared in ` +
              "this module's config.permissions nor a builtin. Nobody would ever be able to open it.",
          ).toBe(true)
        }
      }
    })

    it.runIf(navItems.length > 0)('points nav items at real groups, icons and routes', () => {
      for (const item of navItems) {
        if (item.group !== undefined) {
          expect(
            NAV_GROUP_IDS.has(item.group),
            `${id}: nav item "${item.label}" uses group "${item.group}", which is not in ` +
              `NAV_GROUPS (known: ${[...NAV_GROUP_IDS].join(', ')}). It would silently fall back to "overview".`,
          ).toBe(true)
        }

        expect(
          ICON_NAMES.has(item.icon),
          `${id}: nav item "${item.label}" uses icon "${item.icon}", which is not a valid ` +
            'IconName. It would render as an empty span.',
        ).toBe(true)

        // A parent with children is a section header and may have no `to`.
        if (item.to && !item.children?.length) {
          expect(
            isKnownRoutePath(item.to),
            `${id}: nav item "${item.label}" links to "${item.to}", which no module route and no ` +
              'file-based route serves. The sidebar entry would 404.',
          ).toBe(true)
        }
      }
    })

    it('uses i18n keys, not literal copy, for every user-visible string', () => {
      for (const route of routes) {
        const title = route.meta?.title
        if (!title) continue
        expect(
          resolvesI18nKey(mod, title),
          `${id}: route "${route.path}" has meta.title "${title}", which resolves in neither ` +
            "this module's en.json nor the shell catalog. It would render as the raw key.",
        ).toBe(true)
      }

      for (const item of navItems) {
        expect(
          resolvesI18nKey(mod, item.label),
          `${id}: nav item label "${item.label}" is not a known i18n key. Nav labels are ` +
            'translated at render time, so a literal string here would never be localised.',
        ).toBe(true)
      }
    })

    it.runIf(Boolean(mod.i18n))('ships the same keys in every locale it declares', () => {
      const locales = Object.entries(mod.i18n!)
      const union = new Set(locales.flatMap(([, messages]) => Object.keys(messages)))
      for (const [locale, messages] of locales) {
        const missing = [...union].filter((key) => !(key in messages))
        expect(missing, `${id}: ${locale} is missing ${missing.length} key(s)`).toEqual([])
      }
    })

    it('declares mockHandlers behind the demo flag, never unconditionally', () => {
      // A bare `mockHandlers:` property keeps the dynamic import() in the
      // barrel's module graph, so rolldown emits the msw chunk into a
      // production build that can never call it. The conditional spread is
      // what keeps `verify-bundle.mjs --mode=production` passing.
      const source = fs.readFileSync(path.join(MODULES_DIR, id, 'index.ts'), 'utf8')
      if (!source.includes('mockHandlers')) return

      expect(
        /__VUESTRATA_DEMO__[\s\S]{0,120}?mockHandlers/.test(source),
        `${id}: mockHandlers must be spread conditionally — ` +
          '`...(__VUESTRATA_DEMO__ ? { mockHandlers: ... } : {})` — so MSW stays out of production bundles.',
      ).toBe(true)
    })
  })
})
