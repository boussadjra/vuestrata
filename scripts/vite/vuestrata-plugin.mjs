/**
 * Vuestrata's Vite plugin: where the validated runtime environment meets the
 * build and the dev server.
 *
 * It lives here rather than inline in `vite.config.ts` so that it can belong to
 * Vuestrata, which keeps improving it, while the config that calls it stays the
 * project's own. `vuestrata-plugin.d.mts` beside it keeps that config typed.
 */
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnv } from 'vite-plus'

// Relative imports, not aliases: this file runs in Node before `resolve.alias`
// exists. `env.schema.ts` and `deploy.ts` are dependency-free for exactly this
// reason. Explicit .ts extension: the config may be loaded as native ESM,
// which does not do extensionless resolution.
import { parseAppEnv } from '../../src/modules/core/lib/config/deploy.ts'
import { ENV_KEYS, parseRuntimeEnv } from '../../src/modules/core/lib/config/env.schema.ts'
import { loadDeployConfig } from '../security/deploy-config.mjs'
import { resolveDeployHeaders, resolveRuntimeKeys } from '../security/headers.mjs'

/**
 * Where `vp dev` forwards API requests. Deliberately NOT `VUESTRATA_`-prefixed:
 * Vite inlines every variable with that prefix into the client bundle, and the
 * address of a developer's backend has no business shipping to users.
 */
const DEV_API_TARGET = 'DEV_API_TARGET'

/**
 * The script every page loads before the app bundle. It assigns
 * `window.__VUESTRATA_RUNTIME__`, the values a deployment sets when the app
 * STARTS rather than when it is built (see core/lib/config/runtime-overlay.ts).
 *
 * `public/runtime-config.js` is the copy that ships: an empty overlay, which a
 * deployment replaces — the container entrypoint writes one from its
 * environment, and nginx serves that instead.
 */
const RUNTIME_CONFIG_FILE = 'runtime-config.js'

/** What the file holds when nothing overrides anything. */
const EMPTY_RUNTIME_CONFIG = 'window.__VUESTRATA_RUNTIME__ ||= {}\n'

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`. Under `vp dev`, it also connects the dev
 * server to a real backend — see `devApiProxy`. And it makes every page load
 * the runtime configuration first — see `transformIndexHtml`.
 *
 * This lives in a plugin rather than a `defineConfig(({ mode }) => …)` callback
 * because Vite+ reads the `lint`/`fmt`/`staged` fields off a STATIC default
 * export — a function export breaks `vp fmt` and `vp lint`. The `config` hook
 * gets us the resolved mode while keeping the export static.
 *
 * @param {object} [options]
 * @param {object} [options.deployConfig] The project's deployment config, in
 *   place of reading `src/modules/app/config/deploy.config.ts`. For tests.
 * @returns {import('vite-plus').Plugin}
 */
export function vuestrataEnv(options = {}) {
  let isDemoBuild = true
  let outDir = 'dist'
  let publicDir = 'public'
  /** Vite's `base`: where the app's own files are served from. */
  let base = '/'

  return {
    name: 'vuestrata:env',

    configResolved(resolved) {
      outDir = resolve(resolved.root, resolved.build.outDir)
      publicDir = resolved.publicDir
      base = resolved.base
    },

    /**
     * `public/mockServiceWorker.js` is a static asset, so Vite copies it into
     * dist for BOTH targets. In a production build that publishes a service
     * worker able to intercept every request in the app — dead weight at best,
     * and a confusing artifact for anyone auditing the deployment. Nothing
     * registers it there (the registration code is compiled out), so remove it.
     *
     * This runs in `closeBundle` rather than `generateBundle` because public-dir
     * files are copied straight to disk and never enter the rollup bundle.
     *
     * The same reasoning, the other way round, for `runtime-config.js`: every
     * page asks for it, so a build must never lack it. A project whose
     * `public/` has no copy gets the empty one here, rather than a page whose
     * first script is a 404 — or, behind an SPA fallback, index.html parsed
     * as JavaScript.
     */
    async closeBundle() {
      if (!existsSync(outDir)) return
      if (!existsSync(resolve(outDir, RUNTIME_CONFIG_FILE))) {
        await writeFile(resolve(outDir, RUNTIME_CONFIG_FILE), EMPTY_RUNTIME_CONFIG)
      }
      if (isDemoBuild) return
      await rm(resolve(outDir, 'mockServiceWorker.js'), { force: true })
    },

    /**
     * The dev server's answer for `runtime-config.js` when `public/` has none,
     * so that `vp dev` behaves like the build above. With the file in place
     * Vite serves it as it serves anything under `public/`, and this stays out
     * of the way.
     */
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]
        if (
          path !== `${base}${RUNTIME_CONFIG_FILE}` ||
          (publicDir && existsSync(resolve(publicDir, RUNTIME_CONFIG_FILE)))
        ) {
          next()
          return
        }
        response.setHeader('Content-Type', 'text/javascript')
        response.setHeader('Cache-Control', 'no-store')
        response.end(EMPTY_RUNTIME_CONFIG)
      })
    },

    async config(config, { mode, command, isPreview }) {
      // Nothing is being bundled: `vp dev`, `vp preview`, and Vitest, which
      // resolves as `serve` too. Only a build must refuse a local backend URL.
      const serving = command === 'serve'
      // The proxy is for `vp dev` alone. `vp preview` would inherit it through
      // `preview.proxy`, which defaults to `server.proxy`. Vitest starts no
      // server, so a proxy configured there never acts.
      const devServer = serving && !isPreview
      const isDev = serving || mode !== 'production'
      const envDir = resolveEnvDir(config)

      // Strict parse: an invalid or self-contradictory configuration fails the
      // BUILD here rather than reaching a browser. The app-side counterpart in
      // core/lib/config runs the same schema leniently.
      const rawEnv = loadEnv(mode, envDir, 'VUESTRATA_')
      const env = parseRuntimeEnv(rawEnv, { isDev, serving })
      isDemoBuild = env.runtimeMode === 'demo'

      // The project's own half of the configuration, held to the same standard:
      // an invalid variable or an impossible header source fails here, with the
      // file to fix named, rather than in a browser or in a container that will
      // not start. Vitest is left out. It runs the app's modules, where the
      // lenient reading applies, and a test run should not need the variables
      // of a deployment to begin.
      if (mode !== 'test') {
        const root = resolve(config.root ?? process.cwd())
        const deployConfig = options.deployConfig ?? (await loadDeployConfig({ root }))
        parseAppEnv(deployConfig, rawEnv, { reservedKeys: Object.values(ENV_KEYS) })
        resolveDeployHeaders(deployConfig.headers)
        resolveRuntimeKeys([], deployConfig.runtime ?? [])
      }

      // Read only by the dev server: a build never loads it, so it can never
      // reach `define` — and `envPrefix` never matches it, so it never reaches
      // `import.meta.env` either.
      const proxy = devServer
        ? devApiProxy(env.apiUrl, readDevApiTarget(mode, envDir), (message) => this.warn(message))
        : undefined

      return {
        define: {
          // Compile-time switch that lets rolldown dead-code-eliminate every
          // demo path (MSW, seeded IndexedDB users, demo credentials) out of a
          // production bundle. `appConfig` cannot do this — it is a runtime
          // value. Forced on under test so demo-state suites keep working.
          __VUESTRATA_DEMO__: JSON.stringify(mode === 'test' ? true : isDemoBuild),
        },
        build: {
          // 'hidden' emits .map files without the `//# sourceMappingURL=`
          // comment — useful for uploading to an error tracker, but the files
          // still ship and are fetchable by guessing the name. Emit them only
          // for the demo build; a real production deploy uploads them
          // out-of-band (see Dockerfile, which strips any that are generated).
          sourcemap: isDemoBuild ? 'hidden' : false,
        },
        ...(proxy ? { server: { proxy } } : {}),
      }
    },

    /**
     * Load the runtime configuration before the app.
     *
     * A classic script, not a module and not a fetch: a classic script in the
     * document runs before any module script does, and the values have to be in
     * place by then — `runtimeEnv` and the API client's base URL are resolved
     * while their modules are evaluated.
     *
     * It is added here, after Vite has processed the page, so that nothing
     * bundles or inlines it: the file has to stay a separate URL that a
     * deployment can answer differently, and `script-src 'self'` would refuse
     * an inline copy anyway. For the same reason the URL is built from `base`
     * by hand rather than left for Vite to rewrite.
     *
     * The page's own CSP `<meta>` needs no help to reach a cross-origin API: it
     * does not restrict connections (see META_CONNECT_SRC in
     * scripts/security/headers.mjs).
     */
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: `${base}${RUNTIME_CONFIG_FILE}` },
          // First in the document, so it also precedes the module script in
          // source order: nobody has to know the execution rules to see that
          // the configuration comes first.
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

/**
 * The directory Vite reads `.env` files from, resolved the way Vite resolves
 * it, so the values validated here are the values Vite inlines.
 */
function resolveEnvDir(config) {
  // `envFile: false` is the deprecated spelling of `envDir: false`.
  if (config.envDir === false || config.envFile === false) return false
  const root = resolve(config.root ?? process.cwd())
  return config.envDir ? resolve(root, config.envDir) : root
}

/**
 * `DEV_API_TARGET` from the environment or any `.env` file for `mode`.
 *
 * The variable's own name doubles as the prefix. The usual `''` would copy
 * every variable in the environment, and under `vp run` it would also hand
 * that empty prefix to the task runner, which `loadEnv` asks for matching
 * variables — making every variable in the environment an input of the task.
 */
function readDevApiTarget(mode, envDir) {
  return loadEnv(mode, envDir, DEV_API_TARGET)[DEV_API_TARGET]?.trim() || undefined
}

/**
 * `server.proxy` sending the API path to `DEV_API_TARGET`, or undefined.
 *
 * Only a same-origin path can be proxied: the browser asks the dev server for
 * `/api/users`, which forwards it unchanged to `${DEV_API_TARGET}/api/users`.
 * Seen from the browser, that is the reverse-proxy deployment `/api` stands for
 * — first-party cookies, no CORS. An absolute API URL sends the browser
 * straight to that origin, so the dev server never sees the request.
 */
function devApiProxy(apiUrl, target, warn) {
  if (!target) return undefined

  const path = sameOriginPath(apiUrl)
  if (path === undefined) {
    warn(
      `[vuestrata:env] ${DEV_API_TARGET} is set, but ${ENV_KEYS.apiUrl}="${apiUrl}" is absolute: ` +
        'the browser calls that origin directly, so nothing is proxied. To use the proxy, set ' +
        `${ENV_KEYS.apiUrl} to a same-origin path such as /api.`,
    )
    return undefined
  }
  if (path === '') {
    warn(
      `[vuestrata:env] ${DEV_API_TARGET} is set, but ${ENV_KEYS.apiUrl}="${apiUrl}" is the site ` +
        'root: proxying it would send the app itself to the backend, so nothing is proxied. ' +
        'Serve the API under a path such as /api.',
    )
    return undefined
  }

  return {
    // A RegExp key (Vite treats one starting with `^` as a pattern) that stops
    // at a segment boundary: `/api` and `/api/users`, but not `/api-docs`.
    [`^${escapeRegExp(path)}(?=[/?]|$)`]: {
      target: parseDevApiTarget(target),
      // The backend sees its own host in `Host`, as it would behind a real
      // proxy; `xfwd` passes the browser-facing one in `X-Forwarded-Host`,
      // which framework CSRF checks compare `Origin` against.
      changeOrigin: true,
      xfwd: true,
      ws: true,
      // Drop any `Domain` from `Set-Cookie`, so a session cookie lands on the
      // host the browser is actually talking to — the dev server — rather
      // than being rejected for naming the backend's.
      cookieDomainRewrite: '',
    },
  }
}

/**
 * The path of a same-origin API URL without its trailing slash (`/api/` →
 * `/api`), or undefined when the URL names an origin. `//host/api` is
 * protocol-relative — another origin — even though it starts with a slash.
 */
function sameOriginPath(apiUrl) {
  if (!apiUrl.startsWith('/') || apiUrl.startsWith('//')) return undefined
  return new URL(apiUrl, 'http://localhost').pathname.replace(/\/+$/, '')
}

/**
 * The target as given, once it is known to be an http(s) URL. Anything else
 * fails `vp dev` at startup: the developer asked for a proxy, and one that can
 * never connect would only surface later, as a proxy error on every request.
 */
function parseDevApiTarget(value) {
  let protocol
  try {
    protocol = new URL(value).protocol
  } catch {
    // Not a URL at all — reported below, like one with the wrong scheme.
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(
      `[vuestrata:env] ${DEV_API_TARGET} must be an absolute http(s) URL such as ` +
        `http://localhost:8000 (received "${value}").`,
    )
  }
  return value
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
