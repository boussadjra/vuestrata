# Vuestrata

> **Note:** Vuestrata supersedes _Vueye_, a simpler Vue 3 starter template.

A modern, production-ready Vue 3 template with multi-theme support, Reka UI wrappers, and enterprise-grade tooling.

## Features

- **Vue 3.5+** with `<script setup>` and Composition API
- **TypeScript 6.0+** in strict mode
- **Tailwind CSS v4** with CSS-first configuration
- **Multi-theme system** — 10 built-in themes (Default, Blueprint, Brutalist, Febin, Forest, Ghibli, Ocean, Rose, Sunset, Terminal) + dark mode
- **Reka UI component layer** — `Ui*` wrappers backed by shared base composables
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
vp dev

# Project checks (format, lint, typecheck)
vp check

# Lint
vp lint

# Custom lint rules (chained after `vp lint` via the package.json
# `lint` script; run standalone if you invoke `vp lint` directly):
#   - inline-vue-handlers: forbids inline `@event` handlers in <template>
#   - module-scope-state: forbids top-level mutable state in src/**
#     (use `createGlobalState` for simple shared state, Pinia for
#     complex orchestration; see docs/2.architecture/1.overview.md).
#     Hard-fails the build on violation.
node scripts/lint/run-custom-rules.mjs

# Format
vp fmt

# Unit tests
vp test --run

# E2E tests
vp run test:e2e

# Build for production
vp build

# Preview production build
vp preview
```

## Project Structure

```
src/
├── modules/
│   ├── app/                # Main application module
│   │   ├── assets/         # Static assets (fonts, images)
│   │   ├── components/
│   │   │   ├── layout/     # AppHeader, AppSidebar, AppFooter
│   │   │   └── ui/         # Reka-backed Ui wrappers and shared base composables
│   │   │       ├── Ui*.vue # Consumer-facing UI wrappers
│   │   │       └── base/   # Shared base composables (Formwerk integration)
│   │   ├── composables/    # useTheme, useBilling, useDataTable
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
│   ├── showcase/           # Forms and data-table demo module
│   ├── users/              # Users module (TanStack Query pattern)
│   └── settings/           # Settings module (Pinia pattern)
├── App.vue                 # Root component
└── main.ts                 # Bootstrap entry
```

## Theme System

Vuestrata ships with 10 built-in themes plus dark mode:

`default`, `blueprint`, `brutalist`, `febin`, `forest`, `ghibli`, `ocean`, `rose`, `sunset`, and `terminal`.

Themes are registered in `src/modules/app/config/theme.config.ts`, applied as `theme-*` classes on `<html>`, and managed through `useTheme()` with first-paint syncing handled by `bootstrapTheme()`.

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
vp run docker:build
vp run docker:run

# Or with docker-compose
docker compose up -d
```

The container build bootstraps the global `vp` CLI once, then uses `vp install --frozen-lockfile`
and `vp build` so the Docker path matches the repo's normal toolchain.

## Release and Versioning

Vuestrata now uses explicit SemVer scripts, including prerelease channels.

```bash
# Show current version
vp run version:show

# Stable bumps
vp run version:patch
vp run version:minor
vp run version:major

# Start prerelease trains
vp run version:prepatch
vp run version:preminor
vp run version:premajor

# Continue an existing prerelease
vp run version:prerelease
vp run version:prerelease:beta
vp run version:prerelease:rc

# Explicit prerelease id override
vp run version:prerelease -- --preid beta
```

Tag releases as `v<version>`; tags with a prerelease suffix such as `v2.1.0-beta.0` are treated
as GitHub prereleases by the release workflow. See `RELEASE.md` for the full release checklist.

## Publish Checklist

Before publishing a new template version:

```bash
vp check
vp test --run
vp run test:e2e
vp run docker:build
```

Then:

1. Update `CHANGELOG.md`.
2. Bump the version with one of the `vp run version:*` scripts.
3. Tag the release as `v<version>`.
4. Push the tag so the GitHub release workflow can publish the artifact.

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
vp dev
```

### Build

To build the App, run

```bash
vp build
```

And you will see the generated file in `dist` that ready to be served.

### Deploy on Netlify

Go to [Netlify](https://app.netlify.com/start) and select your clone, `OK` along the way, and your App will be live in a minute.
