---
title: Vuestrata
description: Vue 3 enterprise starter with Reka UI wrappers, ten themes, and typed API boundaries.
navigation: false
---

# Vuestrata

Vuestrata is a Vue 3 starter for teams that want production shape on day one: Reka UI wrappers, module boundaries, theme tokens, auth scaffolding, typed query keys, and tests that already know the app.

::card-group
::card{title="Getting Started" icon="rocket" to="/docs/getting-started/installation"}
Install, configure, and run the starter through Vite+.
::

::card{title="Architecture" icon="layers" to="/docs/architecture/overview"}
Module boundaries, runtime setup, wrapper architecture, and typed data flow.
::

::card{title="Modules" icon="widget" to="/docs/modules/overview"}
Composable app modules with explicit server-state and client-state ownership.
::

::card{title="Theming" icon="palette" to="/docs/theming/overview"}
10 built-in themes, dark mode, CSS custom properties, and custom theme creation.
::

::card{title="Components" icon="code" to="/docs/components/overview"}
Reka-based Ui wrappers; field behaviour lives in forms composables.
::

::card{title="Recipes" icon="document" to="/docs/recipes"}
Scaffold a module, page, theme, component, or icon set — and the tasks still done by hand.
::

::card{title="Configuration" icon="settings" to="/docs/configuration/environment"}
Runtime configuration for icons, validation, auth, and theming.
::

::card{title="Deployment" icon="rocket" to="/docs/deployment/vercel-demo"}
Ship the backend-free demo, or a production build against your own API.
::

::card{title="Readiness" icon="shield-check" to="/docs/readiness"}
What is ready, what is not — separated for the demo, the template, and your app.
::

::card{title="Troubleshooting" icon="danger-triangle" to="/docs/troubleshooting"}
Failures that have actually happened here, and what caused them.
::
::

## Two artifacts, one codebase

`VUESTRATA_RUNTIME_MODE` decides which application a build produces:

- **`demo`** — MSW answers every request from seeded fixtures. No backend, no
  database, no secrets. This is what the public demo runs.
- **`production`** — MSW, the demo account and the demo state are compiled out
  entirely, and a real auth adapter talks to your API.

The difference is verified mechanically rather than by inspection —
`scripts/build/verify-bundle.mjs` runs eight assertions against the production
artifact in CI. See [Environment](/docs/configuration/environment).
