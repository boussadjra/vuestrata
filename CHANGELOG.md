# Changelog

All notable changes to Vuestrata should be recorded here.

The project follows Semantic Versioning, including prereleases such as `-alpha.N`, `-beta.N`, and `-rc.N`.

## Unreleased

### Added

- Forms await asynchronous saves, map backend validation errors to fields,
  localise schema messages in English, French and Arabic, and expose defaults,
  reset and dirty state. The customer example and module generator use the same
  workflow, including a guard against leaving with unsaved changes.
- A built-in `session` authentication adapter for credentials-based HttpOnly
  cookie sessions, with Sanctum endpoint and CSRF presets. Authentication
  endpoints can use the API origin independently of its path prefix, and the
  development proxy can forward the session and CSRF routes.
- Custom and multiple roles, configurable inheritance and identity-provider
  claim mappers. Route access, permissions and the Users screens use the same
  role definitions; the existing single-role behavior remains the default.
- `vuestrata add ci` generates a consumer workflow; `eject` installs it in place
  of the template workflow. The demo deployment runs only in the upstream
  repository, and toolchain checks inspect every workflow.
- A separate browser acceptance gate for cookie sessions and CSRF, using a
  production build and a Sanctum-style stub backend, in CI and release checks.

### Fixed

- Zod starts in its CSP-safe mode before the runtime schema is created, avoiding
  eval probes that Firefox reports as policy violations. Browser acceptance
  waits for route content and settled form layout instead of network idleness,
  and customer-search checks wait for all three matching fixtures and their
  footer instead of accepting a temporary loading row.
- Multi-platform containers build their portable web assets on the builder's
  native CPU, then package them in the selected nginx architecture. Vite+ uses
  the builder's binding, and pin checks accept the explicit build platform.
- The shell and module catalogs load French and Arabic on demand, with project
  overrides, retryable failures and protection against stale selections. Boot
  awaits the saved language. Shipped feature query entrypoints are excluded from
  startup, reducing the measured production payload from 525 KB to 486 KB gzipped
  without increasing budgets.
- All 47 inherited raw-palette usages now use semantic theme tokens; the lint
  allowance is zero.
- CI and release test commands forward coverage and browser options directly,
  so the test runners interpret them as options. Coverage runs across the full
  suite, matching the global thresholds and the generated consumer workflow.
- The combined upgrade migration retains forms, adapter types, multiple roles,
  hybrid mocks and subpath support together with the current bundle budgets.
- Mobile navigation exposes a touch-sized command search button, and the
  results list scrolls within the viewport. The drawer visits every control
  with Tab even when the browser's default order omits links.
- Missing-chunk browser tests run in Chromium, where Playwright supports
  intercepting the demo service worker's requests. WebKit and Firefox retain
  the normal build, navigation, form and accessibility checks.

### Fork impact

**Handled by `vuestrata upgrade`**

- Updated managed forms, authentication and RBAC infrastructure, and new files.
- Guarded changes to shipped adapter types and route-guard inputs. Edited files
  are kept and receive migration notes or incoming copies for manual merging.
- The five language-loading files upgrade together. If one has project edits,
  the whole group stays and incoming copies are offered for review.

**Needs you**

- Convert old raw colors in project-owned Users and showcase examples to semantic
  tokens when taking the zero-baseline lint rule; upgrades preserve these files.
- Existing modules may drop their non-English catalog imports once the loading
  group is adopted; files under `i18n/` are discovered automatically. The audited
  query entrypoint list in `vite.config.ts` and the added chunk checks in
  `deploy.config.ts` are optional optimizations to merge into project-owned files.
- Select the session and CSRF presets in `auth.config.ts` and `api.overrides.ts`
  for your backend; configure its cookies, CORS and endpoint authorization.
- Declare custom roles and grants in `rbac.overrides.ts`, and map your identity
  provider's claims in `auth.config.ts` when its names differ.
- Use `vuestrata add ci` for your project's workflow and add your own deploy
  job. The upstream session fixture verifies the template contract; acceptance
  against your deployed backend remains a project responsibility.

## 1.1.0-alpha.0 - 2026-10-02

The first release a project that has already been changed can take through
`vuestrata upgrade` and keep its work. Most of it is correctness: sessions, the
API client, the route guard, what the visitor sees when something fails, and the
Docker image. The rest is what lets those fixes reach an existing project.
[`UPGRADING.md`](UPGRADING.md#110) has the steps, in order.

> **Before you deploy: does the app use the `jwt` adapter against an API on
> another origin?** Then the backend has to change first, or its login is
> refused by the browser. It is the first item under [Needs you](#fork-impact).

### Added

**Upgrade tooling**

- a third ownership class, `merged`. The `Ui*` barrel, the forms barrel and
  `core/lib/rbac/types.ts` are Vuestrata's except their `app:` regions, are
  hashed with those regions emptied, and keep the project's entries across an
  upgrade. `vuestrata add` no longer makes them count as edited
- an upgrade writes a seam a release adds (once, never over an existing file)
  and appends new entries to the `vuestrata:` region of `setup.ts`,
  `nav-groups.ts`, `theme.config.ts`, `app.css`, `icons/index.ts` and
  `.env.example`. A region the project edited is left alone, with a note
- `vuestrata adopt <path...>` records a file merged by hand from
  `.vuestrata/incoming/` as clean, so it updates again
- migrations can hand a project-owned file to Vuestrata (`promote`), turn a
  managed file into a merged one (`reclassify`), print a note, and change a
  project-owned file only where it still holds the text a release shipped. A
  migration is named by release core (`migrations/1.1.0/`) and runs again for
  each prerelease
- `vuestrata doctor` fails on a missing seam the lock tracks, and warns about
  shipped files waiting for `adopt`, a CLI older than the lock, a merged file
  edited outside its `app:` regions and a `runtime-backends.ts` that does not
  install `rbac.overrides.ts`
- the lockfile lists the `docs/` pages the template shipped, so `eject` can
  tell them from yours

**API client**

- `AppError` carries `kind` (`network`, `timeout`, `aborted`, `http`,
  `contract`, `unknown`), `retryable`, `retryAfterMs` and `messageKey`.
  `transportError(kind)` builds one for a request that got no response
- `core/lib/api/retry.ts` (`shouldRetryQuery`, `queryRetryDelay`), the one
  retry policy, and `core/lib/api/failure.ts` (`toAppError`, `parseRetryAfter`,
  `redactUrl`)
- the per-request option `skipAuthRefresh`, which takes a `401` at face value
- `createCollectionApi` reads a record back when a create or update answers
  `201` with `Location`, `204`, or a body that holds only an id

**Auth and sessions**

- refresh through the adapter: optional `refreshSession()` and
  `canRefreshSession()` on `AuthAdapter`, optional `refresh()` and
  `canRefresh()` on `ApiAuthProvider`, and the type `ApiRefreshResult`
- the `auth.logout` event, `{ reason?: 'logout' | 'expired' }`, emitted once
  when a session ends, and `clearAuth(reason?)`
- the login page says so when the session expired
  (`/auth/login?redirect=<path>&reason=expired`)
- `src/modules/auth/lib/safe-redirect.ts`, the one rule for a post-login
  redirect

**RBAC**

- `src/modules/app/config/rbac.overrides.ts`, a file that is yours: declare
  permissions, grant them to roles and withdraw built-in ones with
  `defineRbacOverrides({ grants, withdrawn })`, without editing a file
  Vuestrata owns
- `resolveSubjectPermissions(user)` and `PermissionSubject`: the one rule for
  what a user holds

**Bootstrap and errors**

- `src/modules/app/bootstrap/`: `boot(App, { beforeMount, queryOptions })`
  runs the boot sequence that used to be `src/main.ts`
- a static boot-failure screen, in en, fr and ar, in place of a spinner that
  turned for ever
- a route error state with Retry, Reload page and Go home, for a page that
  fails to set up and for a navigation that fails
- `parseVueErrorInfo()`, which reads Vue's error info in its development and
  production forms, and `wasReported(error)`
- `BaseChart` shows a message in its own place when the charting engine cannot
  be loaded, and the page around it stays

**Container and deployment**

- the image builds for `linux/arm64` as well as `linux/amd64`
- gzip, on the fly and from files compressed at build time; a `/healthz`
  probe; a JSON `502` for an `/api` path nothing routes; one cache policy per
  path class; the web app manifest under its own media type
- both base images pinned by digest, and a Dependabot `docker` entry that
  moves the pins

**Developer workflow**

- `DEV_API_TARGET`: `vp dev` in production mode against a backend on your own
  machine, through a same-origin proxy
- `scripts/vite/vuestrata-plugin.mjs` holds the env plugin, so an upgrade can
  replace it without touching `vite.config.ts`
- `vpr lint:maintainer`, for the checks that only hold in the template's own
  repository

**Docs**

- "Develop Against Your Backend", "When something fails" in the architecture
  overview, and what `refresh-cookie` needs from a backend

### Changed

**Upgrade tooling**

- Vuestrata now maintains the plumbing most fixes land in: the auth store and
  adapters, `useAuth`, `useRbac`, the runtime backends, the route guard,
  session restore, the query plugin, the mock helpers, the locale catalogs,
  two type files, and the build and header scripts. Same paths; an unedited
  copy is adopted and kept up to date, an edited one stays yours
- `src/main.ts` is `boot(App)` and `src/App.vue` is `<AppRoot />`. Both stay
  the project's files
- `vuestrata eject` never edits a file Vuestrata owns. It withdraws the removed
  modules' permissions in `rbac.overrides.ts`, keeps `customers`, removes the
  maintainer-only files, the specs that visit removed routes and the
  dependencies only the docs site used, and leaves your own docs pages,
  landing page, scripts and unreadable specs alone
- `upgrade` refuses to run with a CLI older than the lock, or to move a
  project to an older release. `init --force` keeps generated components and
  themes as yours, and keeps the ejected list

**API client**

- `apiFetch` and the `apiGet`/`apiPost`/… helpers reject only with `AppError`
- a `401` on a non-auth request refreshes once and replays the request,
  mutations included
- one retry layer: the client retries nothing on its own, queries retry at
  most twice and only for a failure that can clear (network, timeout, `408`,
  `425`, `429`, `5xx`), with backoff and `Retry-After`; mutations never retry
- a request that got no response is `NETWORK_ERROR`, `TIMEOUT` or `ABORTED`
  with status `0` (it was `RUNTIME_ERROR` with status `500`)
- an `Authorization` header the caller sets is sent as it is
- `createCollectionApi` rejects a response that breaks its schema with
  `AppError` `CONTRACT_MISMATCH`, invalidates after a failed write too, and
  cancels a superseded list or detail request

**Auth and sessions**

- `jwt` under the default `refresh-cookie` mode sends cookies on its
  `/auth/*` requests, and nowhere else
- a refresh answered `401` or `403` ends the session at once; refresh requests
  made through the adapter carry no `Authorization`
- an expired session redirects to the login page only from a protected route,
  once, with `redirect` and `reason=expired`; a `401` after a sign-out
  redirects nowhere
- signing out or expiring empties the TanStack Query cache
- a post-login `redirect` is honoured only when it is an in-app path

**RBAC**

- the route guard, `useRbac` and the sidebar give one answer for what a user
  holds; `useAuthStore().userPermissions` is that resolved set
- `vuestrata add module` declares permissions in `rbac.overrides.ts`

**Bootstrap and errors**

- the error boundary traps a `setup()` that fails while its page is coming up,
  an async component that fails to load and has no `errorComponent`, and a
  render that fails three times in a row. Everything else stays where it was
- Retry is a page load when what failed was a file
- one incident is reported once
- the detail on the boot-failure screen shows the error's name and a first
  line with URLs, paths and response bodies removed

**Container and deployment**

- the image runs nginx 1.30.5; its `HEALTHCHECK` and the compose healthcheck
  probe `/healthz`
- `verify-bundle --mode=production` searches every chunk, the in-app docs
  included, for the demo account and the demo store names. The total-JS budget
  is 6.75 MiB (it was 6.5)
- `check-toolchain-pins` checks both vite-plus bindings the Dockerfile names
- CI runs the template's own gates and the CLI round trip only in the
  template's repository, and ends the docker job with an arm64 build

**Developer workflow**

- `vpr lint` and `vpr test --run` hold in a project: the shipped-lockfile
  check and the public-surface snapshots moved to `vpr lint:maintainer`
- tests get 15 s (Vitest's default is 5), and a local run uses half the cores
- `package.json` declares the Node range the tools need:
  `^22.22.2 || ^24.15.0 || >=26.0.0`

**Docs**

- the auth endpoint contract matches what the adapters call (`POST /auth/token`
  for the oauth exchange, the MFA shapes, which endpoints `jwt` alone uses)
- the in-app docs no longer quote the demo credentials or the demo store names
- recipes send project strings to `<locale>.overrides.json` and permissions to
  `rbac.overrides.ts`
- `AGENTS.md` is the highest authority, in place of a constitution file the
  repository no longer ships

### Fixed

**Upgrade tooling**

- a merged file kept its hash only until the formatter indented its region
  markers, and then stopped updating
- a comment in `.env.example` that documents no variable was appended again
  on every upgrade
- a replaced `main.ts` dropped the query options of an edited
  `plugins/vue-query.ts` without a word
- the first upgrade that left a copy in `.vuestrata/incoming/` turned
  `vp check` and `vpr lint` red: the linter type-checked the copies as source
- `eject` deleted a project's own docs pages, landing page, scripts and whole
  specs, left `vpr lint` red, and left the header and footer linking to a
  docs site that was gone
- `vpr version:set -- <version>` failed on the `--` it documents

**API client**

- a request that hit a `401` failed even when the refresh it started succeeded
- one failed query could send up to eight requests
- a write answered `201` + `Location` or `204` was reported as a failed save

**Auth and sessions**

- `jwt` with `refresh-cookie`, the production default, could not keep a
  session: no `/auth/*` request sent or stored a cookie
- a refresh still in flight at a sign-out could hand its token to the next
  person to sign in on that tab
- a visitor who had just signed out was told their session expired
- a token lifetime over 24.8 days overflowed the refresh timer into a loop
- a resume whose `/auth/me` failed left a spent refresh token in Web Storage
- `/\host` and control characters passed the redirect check

**RBAC**

- a user the backend described by role alone got a sidebar of links that all
  answered `/403`

**Bootstrap and errors**

- the route error boundary never fired in a production build
- a boot that failed left the spinner turning; so did a first navigation a
  guard refused
- a route whose chunk was really gone reloaded the page on every click, and
  reloaded in a loop when `sessionStorage` could not be written
- a failed navigation was reported twice, and a page the boundary took down
  went on reporting
- one chart whose chunk failed replaced the whole page

**Container and deployment**

- the image served its JavaScript and CSS uncompressed, cached the favicon for
  a year, marked a missing chunk as an immutable `404`, and answered an
  unrouted `/api` call with `index.html`
- the image could not be built on arm64
- `verify-bundle` failed at random when a chunk's content hash spelled `msw`,
  and its docs exemption hid the demo account in two shipped pages

**Docs**

- a docs page had two level-one headings

### Fork impact

`vuestrata upgrade` prints a note for everything below that it could not do
for you, and leaves the release's version of any file it held back in
`.vuestrata/incoming/`.

**Handled by `vuestrata upgrade`**

- every managed file is replaced, and every file a project never edited among
  those that became managed is adopted and brought up to date
- `src/main.ts`, `src/App.vue` and the env plugin in `vite.config.ts` are
  rewritten when they are still what 1.0.1-alpha.5 or 1.0.1-alpha.6 shipped.
  A project with its own query options gets
  `boot(App, { queryOptions: vueQueryOptions })`
- the three merged files are reclassified, so a barrel that already holds
  generated entries is not offered back to you as an edit
- `rbac.overrides.ts` is written
- a project that ran `eject` on 1.0 gets this release's `core/lib/rbac/types.ts`
  and `inheritance.ts` over the two copies that command edited, and the
  permissions it removed are withdrawn in `rbac.overrides.ts` instead, so every
  role holds what it held
- the template-lock check leaves the `lint` script in `package.json`
- `plugins/router.ts`, `plugins/stale-chunk.ts` and the login page get this
  release's changes where the shipped lines are still there
- the demo literals leave the three docs pages and the showcase forms page
  that quoted them, and `e2e/forms.spec.ts` follows
- eight tests that asserted 1.0 behaviour of files this release replaces are
  updated, an unedited test block in `vite.config.ts` gets the 15 s timeout
  and the worker cap, and its lint and format ignore lists gain
  `'.vuestrata/**'`
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/dependabot.yml`,
  `.github/workflows/ci.yml`, `e2e/production-artifact.spec.ts` and
  `scripts/lint/check-toolchain-pins.mjs` are replaced when unedited. The
  `Dockerfile` and the spec wait for the header generators: beside a pair you
  kept they stay as they are, and the next upgrade after you merge replaces
  them
- the two header generators are replaced together when both are unedited
- new upstream entries are appended to your registries' `vuestrata:` regions

**Needs you**

- **A cross-origin API must allow credentials.** `jwt` under the default
  `VUESTRATA_SESSION_PERSISTENCE` (`refresh-cookie`) now sends cookies on its
  `/auth/*` requests. An API on another origin must answer those with
  `Access-Control-Allow-Origin: <the app's exact origin>`,
  `Access-Control-Allow-Credentials: true` and an explicit
  `Access-Control-Allow-Headers: Authorization, Content-Type`. A `*` in any of
  them is read literally on a credentialed request, so a backend that answers
  `*`, for the origin or for the headers, has its login refused by the
  browser. Change the backend before you deploy the upgraded app. If it sets no
  refresh cookie, set `VUESTRATA_SESSION_PERSISTENCE` to `none`, `session` or
  `local`, and nothing changes. A same-origin API (`VUESTRATA_API_URL=/api`)
  needs none of this.
  [`docs/6.configuration/1.environment.md`](docs/6.configuration/1.environment.md)
  lists what the backend must do. The upgrade prints this as a note unless a
  `.env` or `.env.production` file shows it cannot apply; a project that kept
  its own `auth/adapters/base.ts`, `jwt.ts` or `types.ts` keeps the 1.0
  behaviour until it merges them
- **Run `vpr security:headers` after the upgrade** when the header generators
  were replaced. `vpr lint` reports drift until you do. It skips a deployment
  the project does not have (no `docker/`, no `vercel.json`, no `public/`), and
  so do the drift check and `check-toolchain-pins`
- **The production bundle check is stricter.** It fails when any chunk, your
  docs pages included, contains `demo@vuestrata.dev`, `vuestrata-demo-auth` or
  `vuestrata-demo-v1`. The upgrade rewords the shipped lines; a line you
  edited is named in a note. The budgets (750 KB gzipped initial payload,
  850 KB largest eager chunk, 6.75 MiB total JS) now live in a managed file:
  a project that changed one edited `verify-bundle.mjs` and keeps its copy
- **`main.ts` and `App.vue`.** If you edited either, it stays, with the old
  boot sequence. Move your `app.use(...)` calls into
  `boot(App, { beforeMount })`, pass query options as `queryOptions`, and
  replace the file with the shell in `.vuestrata/incoming/`
- **Consumer and maintainer gates.** `packages/cli`, `scripts/release` and the
  CLI tests in your project are the template's own, at the version you cloned.
  No upgrade updates them, and `vpr gen:*` still runs that copy. Use
  `vp exec vuestrata add …`, or run `vuestrata eject`, which removes them. An
  edited `ci.yml` keeps the `cli-roundtrip` job: delete it
- **Permissions.** If you edited `core/lib/rbac/inheritance.ts`, the release
  arrives in `.vuestrata/incoming/`: move your grants into
  `rbac.overrides.ts`. If you edited `state/runtime-backends.ts`, add the two
  lines the note gives, or `rbac.overrides.ts` has no effect. Entries in the
  `app:permissions` region of `rbac/types.ts` keep working. **If you edited
  the union in `core/lib/rbac/types.ts` itself** (beyond what the 1.0 `eject`
  removed, which the upgrade handles), the project does not type-check until
  you merge it: the upgrade says so first, with the steps
- **A file you kept costs more than its own fixes** in two places. An edited
  `stores/auth.ts` announces no `auth.logout`, so signing out does not clear
  the query cache. An edited `scripts/security/headers.mjs` leaves `vp dev`
  without a CSP and `deploy.config.ts` headers without effect. Neither breaks
  the build, and the upgrade's note for each says what to merge
- **`.node-version`.** `vp` resolves Node from `.node-version`,
  `devEngines.runtime` and `engines.node` before `.nvmrc`, so local runs were
  on a newer major than CI and the image. The template now pins `22` there and
  `check-toolchain-pins` holds it to `.nvmrc`. In your project the file is
  yours: `vp env pin 22`
- **The docs site.** The one-heading fix is in
  `src/modules/app/components/docs/`, which is yours: copy `DocsContent.vue`,
  `DocsShell.vue` and `docsNavigation.ts` from the release if you kept the
  docs site
- **Guard and UI now agree.** A user whose `/auth/me` carries a role and no
  `permissions` can open the routes that role grants (the guard used to answer
  `/403`). A signed-out visitor holds nothing in `useRbac()`. Code that read
  `userPermissions` to detect "the backend sent no permissions" must read
  `user.permissions`
- **`apiFetch` rejects only with `AppError`.** Code that inspected ofetch's
  `FetchError` (`name`, `data`, `response`) reads `status`, `code`, `details`
  and `kind` instead; `normalizeError` accepts both. Code that matched
  `RUNTIME_ERROR` or status `500` for a request that never got a response now
  sees `NETWORK_ERROR`, `TIMEOUT` or `ABORTED` with status `0`. A response
  that breaks a collection schema rejects with `CONTRACT_MISMATCH`, not a
  `ZodError`. A request that was waiting for a refresh when its session ended
  rejects with kind `aborted`
- **Retries.** Queries retry at most twice and never for another `4xx`;
  mutations never retry. An edited `plugins/vue-query.ts` keeps `retry: 1`
  over a client that no longer retries: set `retry: shouldRetryQuery` and
  `retryDelay: queryRetryDelay` from `~/lib/api/retry`
- **Session edges your backend may notice.** A refresh answered `401` or `403`
  is not retried. Refresh requests carry no `Authorization`, so a backend
  that requires the expired access token on `/auth/refresh` refuses them.
  `ApiAuthProvider.setAuth` receives an empty refresh token when the backend
  sent none, and `expiresIn` as a third argument. A `?redirect=` holding a
  same-origin absolute URL is ignored. `VueQueryPlugin` from
  `plugins/vue-query` is a wrapper with the same usage. An oauth backend
  serves `POST /auth/token`, and `mfa/setup` returns `qrCodeUrl` and
  `backupCodes`: the 1.0 docs said otherwise
- **Error screens.** A project's own boot test must give its fake router
  `onError`, `afterEach` and `currentRoute`. A `setup()` that fails after its
  page is on screen leaves an empty spot, not the error state. Retry reloads
  the page for a failed chunk. The boot-failure detail shows less.
  `plugins/stale-chunk.ts` must keep exporting `isStaleChunkError`
- **Docker.** A missing hashed chunk is a plain `404`; files outside
  `/assets/` are cached for an hour, not a year; `index.html` is `no-cache`;
  an unrouted `/api` answers a JSON `502`, so route it at your ingress.
  `e2e/production-artifact.spec.ts` asserts all of that, and fails against an
  image built with the old generators. arm64 is built in CI and has not been
  run
- **`eject` behaves differently** if you have not run it yet: see Changed. Run
  `vp install` afterwards
- **Coming from before 1.0.1-alpha.5?** The entry below applies too

## 1.0.1-alpha.4 to 1.0.1-alpha.6 - 2026-08-21

What these three prereleases shipped, recorded under "Unreleased" at the
time. The CLI and the file ownership classes arrived in 1.0.1-alpha.5.

### Added

- `@vuestrata/cli` (`packages/cli`) — `init`, `add`, `diff`, `upgrade`,
  `doctor` and `eject`. The `vpr gen:*` scripts now delegate to it
- file ownership classes (`managed` / `seeded` / `merged`) and
  `vuestrata.lock.json`, which records a content hash per file so an upgrade can
  tell an untouched file from one the project edited
- slot-based path resolution, so the tooling still works in a project that
  moved things; override any slot in an optional `vuestrata.config.json`
- fork-owned override files nothing upstream writes to:
  `styles/brand.css`, `config/app.overrides.ts`, and
  `locales/<locale>.overrides.json`, deep-merged over the shell catalog
- `origin: 'demo' | 'template' | 'app'` on every module, asserted by the module
  contract test; `vuestrata eject` uses it to know what to remove
- a lint rule keeping `components/ui/**` free of application stores and feature
  modules, so the component layer stays independently upgradable
- `UPGRADING.md`, and the compatibility rule in `RELEASE.md`
- explicit version bump scripts with prerelease support
- release workflow and repository templates for contribution, issues, and pull requests

### Changed

- every registry sentinel is now a `vuestrata:` / `app:` pair rather than one
  shared `gen:` region. Upstream and local entries can no longer collide.
  Migration `1.1.0` applies this
- `UiToast` emits `show` instead of calling the notification store
- `AppFooter` reads its product name and links from `config/app.overrides.ts`
- `Plan.addFile()` requires an ownership argument; a file with no declared owner
  cannot be written
- CI now uses the repository-standard `vp` workflow
- Docker build now installs and uses `vp` for dependency installation and production builds

### Fork impact

- **Handled by `vuestrata upgrade`:** the sentinel rename.
- **Needs you:** if you used `UiToast`, add `@show="notifications.add"`. If you
  edited `semantic.css`, `AppFooter.vue` or any `Ui*` wrapper, those files are
  now yours — the upgrade leaves them alone and writes the new version to
  `.vuestrata/incoming/` to compare against.
- Run `vuestrata init` once to start tracking, then `vuestrata doctor`.

## 1.0.1-alpha.3 - 2026-08-20

### Fixed

- MSW handlers are anchored to the configured `VUESTRATA_API_URL` instead of a
  bare `*/<resource>` wildcard. The wildcard also matched the app's own source
  files in dev (`/src/modules/projects/presentation.ts`) and hard reloads of
  detail routes (`/dashboard/projects/42`), answering both with 401
- the demo super-admin is seeded after `setupModules()` and its grants are
  reconciled on every boot, so module-contributed permissions reach it and a
  returning visitor is no longer stuck with a stale snapshot
- a module marked `enabledByDefault` and added after a browser's first boot now
  enables instead of staying invisible forever

### Added

- `tryGetRegisteredPermissions()`, an RBAC registry read that returns an empty
  set rather than throwing when no backend is installed
- `test/unit/architecture/demo-access.test.ts`, asserting the demo account holds
  every declared permission, may open every module route, and sees every nav
  item
- `test/integration/mocks/api-scope.test.ts`, asserting the mock backend answers
  API URLs and nothing else

## 2.0.0 - 2026-06-17

### Added

- current Vue 3 starter baseline with modules, providers, docs, tests, and deployment assets
