# Vuestrata

An opinionated Vue application foundation with enforced architecture,
generators, and 12 distinct design personalities.

**[Live demo](https://vuestrata.vercel.app/)** · [Documentation](docs/index.md) · [Use this template](https://github.com/boussadjra/vuestrata/generate)

Starting a Vue project is easy. Keeping routing, state ownership, module
boundaries, API access, auth, themes, permissions, mocks, tests and deployment
configuration consistent as the app grows is the expensive part — and the
conventions that matter most fail _silently_. A module never added to
`setup.ts` does not throw; the feature just never loads. A theme wired into
three of its four files does not throw; it renders the wrong surfaces. Demo
mocks left in a production build do not throw; they ship.

So Vuestrata does not merely document its conventions. It makes the important
ones executable:

- **Six custom lint rules** — module-scope state, raw palette utilities (on a
  ratchet), inline template handlers, i18n key parity across `en`/`fr`/`ar`,
  icon-name parity, and the four files a theme must appear in.
- **Four architecture tests** — module registry drift, the module contract,
  docs registration, demo-only access.
- **Bundle verification** — `verify-bundle.mjs` fails the build if an MSW chunk
  or the mock worker reaches a production artifact, or if a size budget is
  exceeded. (The demo-credential markers are checked too, behind
  `--strict-demo`, which CI does not yet enable.)
- **Drift checks** — toolchain pins and security headers are generated from one
  definition each, and CI fails when a copy disagrees.
- **Generators** — `vpr gen:module`, `gen:page`, `gen:theme`, `gen:component`,
  `gen:icon-set` write the files _and_ the registries that are easy to forget.

And 12 built-in themes that are design personalities rather than palette swaps:
each redefines colour ramps, radii and elevation in both colour modes over one
unchanged component layer, and eight of them change the typeface too.

## Status

Vuestrata is in an **alpha release train** (see `package.json` for the current
version). The public demo is deployed and the template is ready to start a
project from; conventions and the public surface may still change between alpha
releases. `RELEASE.md` describes the channels.

What "ready" means here is deliberately split into three questions — the demo,
the template, and _your_ application — in
[Readiness](docs/9.readiness.md).

## Features

- **Vue 3.5+** with `<script setup>` and Composition API
- **TypeScript 6.0+** in strict mode
- **Tailwind CSS v4** with CSS-first configuration
- **Multi-theme system** — 12 built-in themes (Default, Analog, Blueprint, Brutalist, Forest, Ghibli, Harbour, Ocean, Pro, Rose, Sunset, Terminal) + dark mode
- **Reka UI component layer** — 67 `Ui*` wrappers; field behaviour lives in `composables/forms/`
- **File-based routing** via Vue Router 5
- **Auto-imports** — composables, Vue APIs, and components
- **Pinia** stores with composition API
- **Vue I18n** with JSON locales (EN, FR, AR with RTL)
- **Auth scaffolding** with pluggable adapter pattern (mock/JWT/OAuth)
- **Typed API client** built on ofetch
- **MSW** mock service worker for development
- **Vitest** for unit tests, **Playwright** for E2E
- **Oxlint** + **Oxfmt** for fast linting and formatting
- **GitHub Actions** CI/CD pipeline
- **Docker** multi-stage build with Nginx

## Quick Start

```bash
# Install dependencies
vp install

# Start dev server (with MSW mocks)
vpr dev

# Project checks (format, lint, typecheck)
vp check

# Lint
vpr lint

# Custom lint rules (chained after `vpr lint` via the package.json
# `lint` script; run standalone if you invoke `vpr lint` directly):
#   - inline-vue-handlers: forbids inline `@event` handlers in <template>
#   - module-scope-state: forbids top-level mutable state in src/**
#     (use `createGlobalState` for simple shared state, Pinia for
#     complex orchestration; see docs/2.architecture/1.overview.md).
#     Hard-fails the build on violation.
node scripts/lint/run-custom-rules.mjs

# Format
vpr fmt

# Unit tests
vpr test --run

# E2E tests
vpr test:e2e

# Build for production
vpr build

# Preview production build
vpr preview
```

## Extending the Template

Every common extension task has a generator that writes the files **and** the
registries that are easy to forget:

```bash
vpr gen:module payments        # CRUD domain: schema, queries, mocks, pages, i18n, registered
vpr gen:page payments refunds  # a page, wired into the module's routes
vpr gen:theme midnight         # theme, imported and registered in all four places
vpr gen:component Tag          # Ui* wrapper (+ --field for a forms composable)
vpr gen:icon-set tabler        # icon map covering every IconName
```

Add `--dry-run` to preview the plan without writing anything, or `--json` for
machine-readable output. `vpr gen` lists them all.

These exist because the failure mode they prevent is **silent**: a module never
added to `setup.ts`, a theme imported after `semantic.css`, a nav item pointing
at a group that does not exist — none of these throw. Six custom lint rules and
an architecture test suite catch them if you write the files by hand instead.

See [`docs/9.recipes/`](docs/9.recipes/) for what each generator does, what it
deliberately leaves to you, and how to verify. Agents should read
[`AGENTS.md`](AGENTS.md) — the canonical brief.

## Project Structure

```
src/
├── modules/
│   ├── app/                # Main application module
│   │   ├── assets/         # Static assets (fonts, images)
│   │   ├── components/
│   │   │   ├── layout/     # AppHeader, AppSidebar, AppFooter
│   │   │   └── ui/         # Reka-backed Ui* wrappers — the public component surface
│   │   ├── composables/    # useTheme, useBilling, useDataTable
│   │   │   └── forms/      # Field behaviour behind the Ui* field wrappers (Formwerk)
│   │   ├── config/         # app.config, icon provider, theme config
│   │   ├── layouts/        # default, auth, dashboard, blank
│   │   ├── mocks/          # MSW handlers and browser worker
│   │   ├── pages/          # Vue Router file-based routes
│   │   ├── plugins/        # Vue plugins (router, pinia, i18n, vue-query)
│   │   ├── stores/         # Pinia stores (auth, app, notification)
│   │   ├── styles/         # Tailwind CSS entry + themes
│   │   └── types/          # App-level TypeScript types
│   ├── analytics/          # Dashboard, audit log, and charts module
│   ├── auth/               # Auth feature module (login/register/callback pages, useAuth, PKCE)
│   ├── core/
│   │   └── lib/            # Framework-agnostic utilities
│   │       ├── api/        # Typed HTTP client (ofetch)
│   │       ├── errors/     # AppError + normalizeError
│   │       ├── events.ts   # Typed event bus
│   │       ├── logger/     # Scoped logging (consola)
│   │       ├── rbac/       # RBAC engine
│   │       └── validation/ # Zod validation utilities
│   ├── billing/            # Billing module (TanStack Query pattern)
│   ├── customers/          # Reference domain module — the one to copy
│   ├── orders/             # Domain module (master/detail)
│   ├── catalog/            # Domain module (card grid)
│   ├── projects/           # Domain module (kanban)
│   ├── calendar/           # Domain module (calendar)
│   ├── messages/           # Domain module (feed)
│   ├── team/               # Domain module (directory)
│   ├── reports/            # Domain module (restricted page)
│   ├── users/              # Users module (TanStack Query pattern)
│   ├── showcase/           # Forms and data-table demo module
│   ├── settings/           # Settings module (Pinia pattern)
│   ├── setup.ts            # appModules — the module registry
│   └── nav-groups.ts       # Sidebar sections
├── App.vue                 # Root component
└── main.ts                 # Bootstrap entry
```

## Theme System

Vuestrata ships with 12 built-in themes, each in light and dark mode:

`default`, `analog`, `blueprint`, `brutalist`, `forest`, `ghibli`, `harbour`, `ocean`, `pro`, `rose`, `sunset`, and `terminal`.

They are design personalities, not palette swaps. Every theme redefines the same
custom-property vocabulary over one unchanged component layer: full
primary/secondary/accent/surface ramps, radius scales, and shadow or offset-ink
elevation, in both colour modes. Eight also change the body typeface, two change
border weight, four ship their own chart palette, and two add theme-local
drawing primitives. No theme changes the icon set, the spacing scale or motion —
those are chosen elsewhere and stay constant, which is what makes the themes
interchangeable. See [DESIGN.md](DESIGN.md) for what each theme varies.

Themes are registered in `src/modules/app/config/theme.config.ts`, applied as `theme-*` classes on `<html>`, and managed through `useTheme()` with first-paint syncing handled by `bootstrapTheme()`. The `theme-registry` lint rule fails the build when a theme is wired into three of its four files, or imported after `semantic.css`.

## UI Component System

Components are exposed through stable `Ui*` wrappers backed by Reka UI and shared base primitives. Import from `@/components/ui`:

```vue
<script setup>
import { UiButton, UiCard } from '@/components/ui'
</script>
```

## Auth System

The auth system uses a pluggable adapter pattern:

```ts
import { useAuth } from '@/modules/auth'

const { login, register, logout, isLoading, error } = useAuth()
// Demo credentials live in src/modules/app/state/demo/account.ts and are
// shared by the login page, the MSW handler and the e2e helper.
await login({ email: 'demo@vuestrata.dev', password: 'demo1234' })
```

Switch adapters by changing `VUESTRATA_AUTH_ADAPTER` in `.env`:

- `mock` — IndexedDB-backed demo auth. Demo builds only; its endpoints exist
  only inside MSW, so the build rejects it in production mode.
- `jwt` — credentials + bearer token, refreshed via `/auth/refresh`
- `oauth` — OAuth/PKCE authorization-code flow

Each adapter declares a `transport` and a set of `capabilities`, so the UI hides
controls for features the configured adapter does not support rather than
discovering it at click time.

| Adapter | Transport | Register | Social | Magic link | MFA | Refresh | Code exchange |
| ------- | --------- | -------- | ------ | ---------- | --- | ------- | ------------- |
| `mock`  | bearer    | ✅       | ✅     | ✅         | ✅  | ✅      | —             |
| `jwt`   | bearer    | ✅       | ✅     | ✅         | ✅  | ✅      | —             |
| `oauth` | cookie    | —        | ✅     | —          | —   | ✅      | ✅            |

`jwt` and `oauth` are complete against the documented endpoint contract and
verified by `msw/node` contract tests. They need a backend that implements it —
see [Real production deployment](docs/8.deployment/2.real-production.md).

## Environment Variables

Every runtime key uses the `VUESTRATA_` prefix. That prefix **replaces** Vite's
default `VITE_`, so a `VITE_*` variable is never exposed to client code.

The one variable that matters most is `VUESTRATA_RUNTIME_MODE` (`demo` or
`production`) — it decides whether MSW and the demo state are in the bundle at
all. See [Environment](docs/6.configuration/1.environment.md) for the full
reference and `.env.example` for annotated defaults.

## Docker

```bash
# Build and run
vpr docker:build
vpr docker:run

# Or with docker-compose
docker compose up -d
```

The container build bootstraps the global `vp` CLI once, then uses `vp install --frozen-lockfile`
and `vpr build` so the Docker path matches the repo's normal toolchain.

## Release and Versioning

Vuestrata now uses explicit SemVer scripts, including prerelease channels.

```bash
# Show current version
vpr version:show

# Stable bumps
vpr version:patch
vpr version:minor
vpr version:major

# Start prerelease trains
vpr version:prepatch
vpr version:preminor
vpr version:premajor

# Continue an existing prerelease
vpr version:prerelease
vpr version:prerelease:beta
vpr version:prerelease:rc

# Explicit prerelease id override
vpr version:prerelease -- --preid beta
```

Tag releases as `v<version>`; tags with a prerelease suffix such as `v2.1.0-beta.0` are treated
as GitHub prereleases by the release workflow. See `RELEASE.md` for the full release checklist.

## Publish Checklist

Before publishing a new template version:

```bash
vp check
vpr test --run
vpr test:e2e
vpr docker:build
```

Then:

1. Update `CHANGELOG.md`.
2. Bump the version with one of the `vpr version:*` scripts.
3. Tag the release as `v<version>`.
4. Push the tag so the GitHub release workflow can publish the artifact.

## History

Vuestrata supersedes _Vueye_, a simpler Vue 3 starter template. Nothing here
depends on knowing that; it matters only if you are coming from Vueye and
wondering where it went.

## Community

- Contributor guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Changelog and release process: `CHANGELOG.md`, `RELEASE.md`

## License

MIT

### GitHub Template

[Create a repo from this template on GitHub](https://github.com/boussadjra/vuestrata/generate).

### Clone to local

If you prefer to do it manually with the cleaner git history

```bash
vp dlx degit boussadjra/vuestrata my-app
cd my-app
vp install
```

## Usage

### Development

Just run and visit http://localhost:3333

```bash
vpr dev
```

### Build

To build the App, run

```bash
vpr build
```

And you will see the generated file in `dist` that ready to be served.

### Deploy on Netlify

Go to [Netlify](https://app.netlify.com/start) and select your clone, `OK` along the way, and your App will be live in a minute.
