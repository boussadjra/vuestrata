# Vuestrata

> **Note:** Vuestrata supersedes _Vueye_, a simpler Vue 3 starter template.

A modern, production-ready Vue 3 template with multi-theme support, adapter-based UI architecture, and enterprise-grade tooling.

## Features

- **Vue 3.5+** with `<script setup>` and Composition API
- **TypeScript 5.7+** in strict mode
- **Tailwind CSS v4** with CSS-first configuration
- **Multi-theme system** — 10 built-in themes (Default, Blueprint, Brutalist, Febin, Forest, Ghibli, Ocean, Rose, Sunset, Terminal) + dark mode
- **Adapter-based UI architecture** — Swap between Reka UI and Vuetify 0 at runtime
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

# Type check
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
│   │   │   └── ui/         # 60+ adapter-driven UI components
│   │   │       ├── Ui*.vue # Consumer-facing adapter wrappers
│   │   │       ├── base/   # Shared base composables (Formwerk integration)
│   │   │       └── provider/
│   │   │           ├── reka/    # Reka UI implementations (default)
│   │   │           └── vuetify0/# Vuetify 0 implementations
│   │   ├── composables/    # useTheme, useBilling, useDataTable
│   │   ├── config/         # app.config, ui-provider adapter resolver
│   │   ├── layouts/        # default, auth, dashboard, blank
│   │   ├── mocks/          # MSW handlers and browser worker
│   │   ├── pages/          # Vue Router file-based routes
│   │   ├── plugins/        # Vue plugins (router, pinia, i18n, vue-query)
│   │   ├── stores/         # Pinia stores (auth, app, notification)
│   │   ├── styles/         # Tailwind CSS entry + themes
│   │   └── types/          # App-level TypeScript types
│   ├── auth/               # Auth feature module (login/register/callback pages, useAuth, PKCE)
│   ├── core/
│   │   └── lib/            # Framework-agnostic utilities
│   │       ├── api/        # Typed HTTP client (ofetch)
│   │       ├── errors/     # AppError + normalizeError
│   │       ├── events.ts   # Typed event bus
│   │       ├── logger/     # Scoped logging (consola)
│   │       ├── rbac/       # RBAC engine
│   │       └── validation/ # Multi-adapter validation (Zod, Valibot, Yup, ArkType)
│   ├── billing/            # Billing module (TanStack Query pattern)
│   ├── users/              # Users module (TanStack Query pattern)
│   └── settings/           # Settings module (Pinia pattern)
├── App.vue                 # Root component
└── main.ts                 # Bootstrap entry
```

## Theme System

Switch between 4 themes + dark mode:

| Theme         | Description                                  |
| ------------- | -------------------------------------------- |
| Default       | Clean, modern design with subtle shadows     |
| Brutalist     | Bold borders, monospace fonts, raw aesthetic |
| Glassmorphism | Frosted glass effects with backdrop blur     |
| Neumorphism   | Soft shadows, embossed/debossed elements     |

Themes are applied via CSS classes on `<html>` and managed through the `useTheme()` composable.

## Adapter UI System

Components are provider-agnostic. Import from `@/components/ui`:

```vue
<script setup>
import { UiButton, UiCard } from '@/components/ui'
</script>
```

Switch providers at runtime in Settings, or programmatically:

```ts
import { useUiProvider } from '@/config/ui-provider'
const { setProvider } = useUiProvider()
setProvider('vuetify0')
```

## Auth System

The auth system uses a pluggable adapter pattern:

```ts
import { useAuth } from '@/modules/auth'

const { login, register, logout, loading, error } = useAuth()
await login({ email: 'demo@vuestrata.dev', password: 'password' })
```

Switch adapters by changing `VUESTRATA_AUTH_ADAPTER` in `.env`:

- `mock` — Local MSW-based auth (default for development)
- `jwt` — JWT auth contract stub (not yet implemented beyond the shared interface)
- `oauth` — OAuth auth contract stub (not yet implemented beyond the shared interface)

Adapter maturity:

| Adapter | Status  | Notes                                                                                                                              |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mock`  | ✅ Full | Credentials login, registration, logout, user retrieval, refresh, social entry points, magic link request, magic link verification |
| `jwt`   | ⚠ Stub  | Reuses the mock adapter surface until a real backend implementation is added                                                       |
| `oauth` | ⚠ Stub  | Reuses the mock adapter surface until a real backend implementation is added                                                       |

## Environment Variables

All prefixed with `VUESTRATA_`. See `.env.example` for all options.

## Docker

```bash
# Build and run
vp run docker:build
vp run docker:run

# Or with docker-compose
docker compose up -d
```

## License

MIT

### GitHub Template

[Create a repo from this template on GitHub](https://github.com/boussadjra/vuestrata/generate).

### Clone to local

If you prefer to do it manually with the cleaner git history

```bash
npx degit boussadjra/vuestrata my-app
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
