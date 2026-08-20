<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Vuestrata Project Rules

Everything below is project-specific and is not managed by Vite+.

**This file is the canonical brief.** `.github/copilot-instructions.md` and
`CLAUDE.md` point here rather than repeating it, so there is one place to change
when a rule changes.

Highest authority above this file: `.specify/memory/constitution.md`. Read it
before major implementation, and flag conflicts rather than silently violating
them.

## Extending the template

Most extension tasks have a generator. Each writes the files **and** the
registries that are easy to forget, then formats what it wrote.

| Task               | Command                        | Recipe                                 |
| ------------------ | ------------------------------ | -------------------------------------- |
| CRUD domain module | `vpr gen:module <name>`        | `docs/9.recipes/1.add-a-module.md`     |
| Page in a module   | `vpr gen:page <module> <name>` | `docs/9.recipes/2.add-a-page.md`       |
| Theme              | `vpr gen:theme <name>`         | `docs/9.recipes/3.add-a-theme.md`      |
| `Ui*` component    | `vpr gen:component <Name>`     | `docs/9.recipes/4.add-a-component.md`  |
| Icon provider      | `vpr gen:icon-set <name>`      | `docs/9.recipes/5.add-an-icon-set.md`  |
| Locale             | — by hand                      | `docs/9.recipes/6.add-a-locale.md`     |
| Permission         | — by hand                      | `docs/9.recipes/7.add-a-permission.md` |
| Nav group          | — by hand                      | `docs/9.recipes/8.add-a-nav-group.md`  |

Every generator supports `--dry-run` (print the plan, write nothing), `--json`
(the same plan, machine-readable) and `--force`. `vpr gen` lists them all.

**Prefer the generator over hand-writing these files.** Not for speed — because
the failure mode is silence. A module missing from `setup.ts`, a theme imported
after `semantic.css`, a nav item pointing at a group that does not exist: none
of these throw. Read the recipe for what each generator deliberately leaves to
you (domain fields, permission grants, translations).

## Repo map

| Path                                 | What lives there                                                      |
| ------------------------------------ | --------------------------------------------------------------------- |
| `src/modules/app/`                   | The application shell. Aliased `@` and `~`.                           |
| `src/modules/app/components/ui/`     | `Ui*` wrappers — the public component surface.                        |
| `src/modules/app/components/layout/` | App shell UI (header, sidebar, footer).                               |
| `src/modules/app/composables/forms/` | Field behaviour behind the `Ui*` field wrappers.                      |
| `src/modules/app/layouts/`           | Layout components. Must also be in `layoutMap` (`plugins/router.ts`). |
| `src/modules/app/pages/`             | File-routed shell pages (home, docs, 403, showcase).                  |
| `src/modules/app/state/`             | `createGlobalState` singletons.                                       |
| `src/modules/app/stores/`            | App-level Pinia stores.                                               |
| `src/modules/app/styles/`            | Tailwind entry, `semantic.css`, `themes/`.                            |
| `src/modules/core/lib/`              | Framework-agnostic. Aliased `@/lib`, `~/lib`.                         |
| `src/modules/<domain>/`              | Feature modules. `customers` is the reference implementation.         |
| `src/modules/setup.ts`               | `appModules` — the module registry.                                   |
| `src/modules/nav-groups.ts`          | Sidebar sections.                                                     |
| `docs/`                              | Markdown, rendered in-app at `/docs`.                                 |
| `test/{unit,component,integration}/` | Vitest. `e2e/` is Playwright.                                         |

Aliases: `@` and `~` are synonyms for `src/modules/app`. **`@/` is not `src/`.**
`@/lib` → `core/lib`, `@/modules` → `src/modules`.

## Architecture rules

### Route pages are thin inbound adapters

A page under `src/modules/*/pages/` is the boundary between Vue Router and the
application. **A page coordinates; it does not implement.**

A page **may**: depend on Vue Router and normalize route params into typed
values (`useRouteParam`, `useRouteQueryParam`); handle redirects, route
metadata, document title, breadcrumb labels, layout selection, not-found and
route-access states; invoke route-level queries and compose a feature screen.

A page **must not** contain reusable feature or application logic: business
rules, feature permission policy, API details, mutations, cache invalidation,
form state machines, sorting/filtering algorithms, reusable table state, or
toast orchestration tied to a feature action. Put those in the owning module
under `src/modules/<name>/` and give them explicit inputs.

Feature and domain code **must not** depend on route components or raw router
state. `useRoute()`/`useRouter()` inside a feature is only acceptable when
navigation is genuinely that abstraction's job (nav components, breadcrumbs,
route tabs, links, `useAuth`'s post-login redirect).

Dependency direction is one-way:

```text
router → page → feature → shared/application infrastructure
```

Enforced by `no-restricted-imports` (pages may not import `@tanstack/vue-query`
or mocks). Full rule and smell checklist:
[`docs/2.architecture/4.route-pages.md`](docs/2.architecture/4.route-pages.md).

### Module barrels are the public API

Cross-module imports go through `~/modules/<name>` — never a deep path.
Enforced by `no-restricted-imports`. If what you need is not exported, add it to
that module's `index.ts`: deciding what is public is the point. The barrel is
not an index of every file (see the note in `src/modules/users/index.ts`).

Tests are exempt — a unit test should reach an internal directly.

### `core/lib` is framework-agnostic

`src/modules/core/lib/**` must not import `vue`, `vue-router`, `vue-i18n`,
`pinia` or `@tanstack/vue-query` at runtime (type-only imports are fine).
Cross-cutting services go through interfaces and injection slots in
`core/lib/runtime.ts`, with backends installed by `installRuntimeBackends()` in
`src/modules/app/state/runtime-backends.ts`. Enforced by lint.

One deliberate exception: `core/lib/api/collection-queries.ts` **is** the Vue
Query factory. It is excluded in `vite.config.ts`, with the reason recorded there.

### State ownership

The `module-scope-state` rule hard-fails on module-scope mutable state in `src/**`:

- **Server state** → TanStack Query composable in the module's `composables/`.
  Build collections on `createCollectionApi`; do not reimplement pagination.
- **Client state, simple** → `createGlobalState(...)` (auto-imported), under
  `src/modules/app/state/`.
- **Client state, complex** → `defineStore(...)`, under `stores/`.
- **Cross-module events** → the typed bus in `src/modules/core/lib/events.ts`.

Never declare at module scope: top-level `let`; `new Map/Set/WeakMap/WeakSet`
(unless `SCREAMING_SNAKE_CASE`); or unwrapped `ref`/`reactive`/`computed`/
`watch`/`watchEffect`/`useStorage`/`useAppStorage`/`shallowRef`/`shallowReactive`.
Wrap them in `defineStore(...)` or `createGlobalState(...)`.

Allowlisted: `core/lib/events.ts`, `core/lib/runtime.ts`. One-off escape:
`// lint-allow-module-scope-state`, with justification.

Tests use `resetRuntimeState()` (wired into `test/setup.ts` `beforeEach`).

### Colour comes from semantic tokens

Raw Tailwind palette utilities (`bg-red-500`, `dark:text-green-400`) are
rejected by the `no-raw-palette` rule: they ignore the active theme and need a
hand-written `dark:` twin. Use the semantic layer in
`src/modules/app/styles/semantic.css` (`bg-card`, `text-muted-foreground`,
`border-border`, `text-destructive`, …).

That rule is a **bidirectional ratchet** — it also fails when a file has _fewer_
violations than its recorded baseline, so lower the baseline in the plugin when
you migrate a file.

Escape hatch for genuine brand colour: `lint-allow-raw-palette`.

### Use the smallest abstraction that fits

A plain function for a deterministic rule, a query/mutation composable for
server state, a feature composable for a cohesive reactive workflow, a component
for presentation. Do **not** introduce backend-style
`Controller`/`Service`/`Repository`/`Facade` layers. The goal is simpler code,
not more layers.

## What the gates catch

`vp check` runs format, lint and types. `node scripts/lint/run-custom-rules.mjs`
adds six project rules. `vpr test --run` includes `test/unit/architecture/`.

| Check                   | Catches                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `no-restricted-imports` | deep cross-module imports; Vue in `core/lib`; data layer in pages                                           |
| `module-scope-state`    | module-scope mutable state                                                                                  |
| `no-raw-palette`        | raw palette utilities (ratcheted)                                                                           |
| `inline-vue-handlers`   | multi-line inline `@event` handlers under `app/`                                                            |
| `i18n-parity`           | a key in `en` but not `fr`/`ar`                                                                             |
| `icon-parity`           | an `IconName` a provider does not implement                                                                 |
| `theme-registry`        | a theme wired in 3 of 4 files, or imported after `semantic.css`                                             |
| `module-contract` test  | bad layout, nav group, icon or i18n key; dynamic route shadowing a static one; unconditional `mockHandlers` |
| `registry-drift` test   | a module never added to `setup.ts`                                                                          |
| `verify-bundle.mjs`     | MSW or demo credentials reaching a production bundle                                                        |

If a rule blocks you, fix the cause. Reach for an escape hatch only with a
written justification — every one of these exists because the failure it
prevents was silent.

## Quality gates

- **Always**: `vp check`.
- **Routing, layouts, config, providers or runtime wiring changed**: add `vpr build`.
- **User-visible flow or routing changed**: add `vpr test:e2e`.
- **Docs, env or labels changed**: `node scripts/docs/check-links.mjs`.
- Leave no new diagnostics in touched files. Fix root causes rather than masking.
- Update code, docs, `.env.example` and UI copy in the same change.

## Tooling

- Use the `vp` CLI for everything. Never `pnpm`, `npm`, `yarn`, `bun`, or `npx`.
- `vp <name>` is a built-in. `vpr <name>` — short for `vp run <name>` — is a
  `package.json` script or `vite.config.ts` task.
- Six names exist in both places: `dev`, `build`, `preview`, `lint`, `fmt`,
  `test`. Running `vp` for one of those prints a note pointing at the script,
  because the script is usually what you meant — `lint` also runs the custom
  rules, the MSW worker check and the docs link check; `build` also runs
  `vue-tsc`; `dev` sets the port. **Prefer `vpr` for all six.**
- `check` has no script, so `vp check` is correct and prints no note.
- There is no `vp vitest` or `vp oxlint`. Use `vpr test` and `vpr lint`.
- Import from `vite-plus` and `vite-plus/test`, not `vite` or `vitest`.
- For one-off binaries use `vp dlx`.
- Do not install wrapped tools (Vitest, Oxlint, Oxfmt, tsdown) directly, and do
  not introduce parallel tooling.

Generated files — never hand-edit: `typed-router.d.ts`, `src/auto-imports.d.ts`,
`src/components.d.ts`.

## Two build targets

`VUESTRATA_RUNTIME_MODE` (`demo` | `production`) decides whether MSW and the
demo state are in the bundle at all. A module's `mockHandlers` must therefore be
a **conditional spread**:

```ts
...(__VUESTRATA_DEMO__
  ? { mockHandlers: async () => (await import('./mocks/x.handlers')).xHandlers }
  : {}),
```

Declaring the property unconditionally keeps the dynamic `import()` in the
barrel's graph and ships an MSW chunk to real users. `verify-bundle.mjs` is the
only check that can see this — types and tests cannot.
