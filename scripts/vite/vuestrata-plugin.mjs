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
import {
  buildCsp,
  connectSrcFor,
  replaceMetaCsp,
  resolveDeployHeaders,
  resolveRuntimeKeys,
} from '../security/headers.mjs'

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

const CSP_HEADER = 'Content-Security-Policy'

/** The page's CSP `<meta>` tag, whole, and the charset one. */
const CSP_META_TAG = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i
const CHARSET_META_TAG = /<meta\s+charset=[^>]*>/i

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`. Under `vp dev`, it also connects the dev
 * server to a real backend — see `devApiProxy`. It makes every page load the
 * runtime configuration first — see `transformIndexHtml`. And it sends the
 * Content Security Policy a deployment would send from `vp dev` and
 * `vp preview` — see `configureServer`.
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
  /**
   * What the served policy is built from — the API URL, the project's header
   * sources, the variables they name — or null when nothing is being served.
   */
  let served = null
  /** The origin of a cross-origin API URL a BUILD was given, or null. */
  let builtApiOrigin = null

  /** The policy for what is being served: the header, or the `<meta>` variant. */
  const servedCsp = ({ forMeta = false, extraOrigins = [] } = {}) =>
    buildCsp({ ...served, forMeta, extraOrigins })

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
     * `vp dev` sends the policy a deployment would send.
     *
     * Without it, a request to an origin nobody declared works on the
     * developer's machine and is blocked in the first deployment that sends
     * headers, which is the worst place to learn that `connectSrc` in
     * `deploy.config.ts` is missing an entry. With it, the violation is in the
     * console while the code that causes it is still on screen.
     *
     * It is the production policy, enforced, with ONE addition: see
     * `devSocketOrigins`. Nothing else was needed. Vite's client and the
     * modules it serves are same-origin scripts, hot updates use no `eval`, and
     * source maps are read by the devtools, which no page policy governs.
     *
     * Also the dev server's answer for `runtime-config.js` when `public/` has
     * none, so that `vp dev` behaves like the build above. With the file in
     * place Vite serves it as it serves anything under `public/`, and this
     * stays out of the way.
     */
    configureServer(server) {
      if (served) {
        server.middlewares.use((request, response, next) => {
          if (!isMockWorker(request, base)) {
            response.setHeader(CSP_HEADER, servedCsp({ extraOrigins: devSocketOrigins(server) }))
          }
          next()
        })
      }

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

    /**
     * `vp preview` sends the policy too, exactly as generated: it serves a
     * build, and the point of previewing one is to see what a deployment
     * would do. The page's own `<meta>` is whatever the build wrote, as it
     * will be on a static host.
     */
    configurePreviewServer(server) {
      if (!served) return
      const policy = servedCsp()
      server.middlewares.use((request, response, next) => {
        if (!isMockWorker(request, base)) response.setHeader(CSP_HEADER, policy)
        next()
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
        const headers = resolveDeployHeaders(deployConfig.headers)
        resolveRuntimeKeys([], deployConfig.runtime ?? [])

        // A server is about to answer requests: `vp dev` or `vp preview`. The
        // policy it sends is built from what a deployment's would be built
        // from, and built once here, so an API URL no policy can name stops
        // the server with the reason instead of blocking every call later.
        if (serving) {
          served = {
            apiUrl: env.apiUrl,
            headers: deployConfig.headers,
            env: readNamedEnv(mode, envDir, [
              ...headers.connectSrcFromEnv,
              ...headers.websocketFromEnv,
            ]),
          }
          servedCsp()
        } else {
          builtApiOrigin = crossOriginOf(env.apiUrl)
        }
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
     * Under `vp dev` the page's CSP `<meta>` is also rendered for the
     * environment being served, like the header `configureServer` sends. The
     * committed tag is generated for the default `/api`, and a browser
     * enforces it in addition to the header, so a developer pointing
     * `VUESTRATA_API_URL` at another origin would otherwise have every call
     * blocked by the page itself. A build is left as written: its tag is the
     * generator's (`sync-headers.mjs`), which is also what a deployment gets.
     * When that tag does not allow the API origin the build was given, the
     * build says so: nothing else would until a browser blocked the calls.
     */
    transformIndexHtml(html, ctx) {
      const page =
        ctx.server && served
          ? (replaceMetaCsp(
              html,
              servedCsp({ forMeta: true, extraOrigins: devSocketOrigins(ctx.server) }),
            ) ?? html)
          : html
      const src = `${base}${RUNTIME_CONFIG_FILE}`

      if (!ctx.server && builtApiOrigin && metaBlocksConnectionTo(page, builtApiOrigin)) {
        this.warn?.(
          `[vuestrata:env] ${ENV_KEYS.apiUrl} is on ${builtApiOrigin}, which the CSP <meta> in ` +
            'index.html does not allow: a browser will block the API calls of this build. ' +
            'Render the headers for this environment before building ' +
            '(`node scripts/security/sync-headers.mjs --from-env`), or with `--runtime-config` ' +
            'when the API URL is set at start through runtime-config.js.',
        )
      }

      return (
        withRuntimeConfigScript(page, src) ?? {
          html: page,
          // A page with neither tag to put it after: first in the document.
          tags: [{ tag: 'script', attrs: { src }, injectTo: 'head-prepend' }],
        }
      )
    },
  }
}

/**
 * `html` with `<script src>` directly after the CSP `<meta>` — or, on a page
 * without one, after `<meta charset>` — or null when it has neither.
 *
 * After both on purpose. A browser must meet the charset declaration before
 * any content, and a policy delivered in a `<meta>` governs only what follows
 * it: a script placed ahead of the tag would load outside the page's own
 * policy. It still precedes the app's module script in the source, which Vite
 * puts at the end of `<head>`, so nobody has to know that a classic script
 * runs before any module to see that the configuration comes first.
 */
function withRuntimeConfigScript(html, src) {
  const anchor = CSP_META_TAG.exec(html) ?? CHARSET_META_TAG.exec(html)
  if (!anchor) return null

  const end = anchor.index + anchor[0].length
  const indent = /[ \t]*$/.exec(html.slice(0, anchor.index))[0]
  const escaped = src.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `${html.slice(0, end)}\n${indent}<script src="${escaped}"></script>${html.slice(end)}`
}

/**
 * The origin of an absolute API URL as a CSP source, or null for a same-origin
 * path and for a URL no source can name. Never throws: it only decides whether
 * a build has something to warn about.
 */
function crossOriginOf(apiUrl) {
  try {
    return connectSrcFor(apiUrl)
  } catch {
    return null
  }
}

/**
 * Whether the page's CSP `<meta>` would block a connection to `origin`: it
 * states a `connect-src` that neither names the origin nor is left open. A
 * page with no such tag, or no such directive to read, blocks nothing here.
 */
function metaBlocksConnectionTo(html, origin) {
  const policy = /\scontent="([^"]*)"/.exec(CSP_META_TAG.exec(html)?.[0] ?? '')?.[1]
  const sources = /(?:^|;)\s*connect-src\s+([^;]*)/
    .exec(policy ?? '')?.[1]
    ?.trim()
    .split(/\s+/)
  if (sources === undefined) return false

  // `https://*.acme.com` names `https://api.acme.com`: same scheme and port,
  // and a host that ends with the part after the star.
  const [scheme, authority] = origin.split('://')
  const names = (source) =>
    source === '*' ||
    source === origin ||
    (source.startsWith(`${scheme}://*.`) &&
      authority.endsWith(source.slice(`${scheme}://*`.length)) &&
      authority.includes(':') === source.slice(`${scheme}://`.length).includes(':'))
  return !sources.some(names)
}

/**
 * Whether the request is for the MSW worker script, the one response the
 * policy is NOT sent with.
 *
 * A service worker is governed by the policy its own script was served with,
 * not by the page's. The demo's worker answers the requests it has a handler
 * for and re-fetches every other one itself, the web fonts included, and a
 * worker's `fetch()` falls under `connect-src`. Served with this policy, whose
 * `connect-src` names no font host, the worker blocks every font of a page it
 * controls (`net::ERR_FAILED`, and nothing in the page's console says why).
 *
 * Leaving the header off this one script keeps `vp dev` and `vp preview`
 * working as they did before they sent a policy. It is a known difference
 * from a demo deployed behind the generated headers, which apply to the
 * worker script as well. Production builds have no worker and are unaffected.
 */
function isMockWorker(request, base) {
  return request.url?.split('?')[0] === `${base}mockServiceWorker.js`
}

/**
 * What `vp dev` needs that a deployment does not: the WebSocket Vite's client
 * opens to the dev server for hot updates.
 *
 * It goes to the page's own host and port, which `'self'` covers in a browser
 * that follows CSP 3. Not every browser matches `ws:` against an `http:` page
 * that way, so each address the dev server answers on is named: without the
 * socket the page loads and then never updates, with nothing but a console
 * line to say why. An address no source can name (an IPv6 literal) is left to
 * `'self'`.
 */
function devSocketOrigins(server) {
  const urls = [...(server.resolvedUrls?.local ?? []), ...(server.resolvedUrls?.network ?? [])]
  const origins = urls.flatMap((url) => {
    try {
      const { protocol, host } = new URL(url)
      return [`${protocol === 'https:' ? 'wss' : 'ws'}://${host}`]
    } catch {
      return []
    }
  })
  return [...new Set(origins)].filter((origin) => /^wss?:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin))
}

/**
 * The named variables, from the environment or any `.env` file for `mode`.
 * One name at a time, each as its own prefix: see `readDevApiTarget`.
 */
function readNamedEnv(mode, envDir, names) {
  return Object.fromEntries(names.map((name) => [name, loadEnv(mode, envDir, name)[name]]))
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
