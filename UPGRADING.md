# Upgrading

Vuestrata is a template you own a copy of, not a dependency you resolve. That
normally means upstream improvements never reach you — you forked, you changed
things, and a `git merge` would collide on every file both sides touched.

`@vuestrata/cli` exists to make that not true.

```bash
vp add -D @vuestrata/cli          # once
vp exec vuestrata doctor          # is this project upgradable?
vp exec vuestrata diff            # what would change; writes nothing
vp exec vuestrata upgrade         # do it
```

> **New to Vuestrata?** Start at
> [Starting a Project](docs/1.getting-started/3.starting-a-project.md) — taking
> your own copy, removing the demo, and the habits that keep upgrades working.
> This page is the mechanism underneath.

A project cloned from the template arrives already tracked, so there is no setup
step. `vuestrata init` exists only for a project that predates the CLI; see
[Adopting the CLI late](#adopting-the-cli-late).

## The one idea

Every file the tooling writes belongs to exactly one side, and it says which.

| Class     | Who owns it                          | What `upgrade` does                                             |
| --------- | ------------------------------------ | --------------------------------------------------------------- |
| `managed` | Vuestrata                            | Replaces it — unless you edited it, then hands you a copy       |
| `merged`  | Vuestrata, except its `app:` regions | Replaces it around your `app:` entries, which it carries across |
| `seeded`  | You, from the first write            | Writes it once if you have none, then never touches it again    |

`vuestrata.lock.json` records the class of every file plus a hash of what was
written there. That hash is the whole mechanism: it is what distinguishes a file
nobody touched from one you spent a week restyling.

- **Hash matches** → replacing it loses nothing, so it is replaced.
- **Hash differs** → you edited it. Your version stays. The new upstream version
  is written to `.vuestrata/incoming/<path>` and the command prints the
  `git diff --no-index` line to compare them.
- **Not in the lock** → yours outright. Untouched, and never reported.

Nothing is ever overwritten on a guess.

### Merged files

Three files sit inside directories Vuestrata manages, yet `vuestrata add` writes
to them: the `Ui*` barrel (`components/ui/index.ts`), the forms barrel
(`composables/forms/index.ts`) and the permission union (`core/lib/rbac/types.ts`).
Each carries an `app:` region, and that region is yours.

A merged file is hashed with every `app:` region emptied and its region markers
flush left, so neither the entries a generator adds there nor the formatter
indenting the markers around them is an edit. An upgrade replaces the rest of the file
and writes your `app:` entries back into the new version. Edit it _outside_
those regions and it is treated like any edited managed file: yours stays, and
the copy in `.vuestrata/incoming/` already holds your entries, so the diff shows
only what really differs. A release that removes an `app:` region you have
entries in is never written over them; it is offered the same way.

### Seams a release adds

A new release can ship a new seam — a data-only file such as `brand.css` that is
yours from the start. `upgrade` writes it only if you have none: a file already
at that path is adopted as yours, and one you deleted after it arrived stays
deleted. (`doctor` reports that, because Vuestrata's own code imports the seam.)

### Files that change hands

A release can also move a file you have owned until now into Vuestrata's care,
so that fixes to it can reach you. If your copy matches a release that shipped
it, the upgrade adopts it and updates it. If you edited it, your copy stays and
the new version goes to `.vuestrata/incoming/`, like any other edit.

A file you moved to another path is never adopted, whatever it contains: yours
stays, the new version goes to `.vuestrata/incoming/` under your path, and the
shipped path is recorded as ejected so no later release installs a second copy
there. Move it back and run `vuestrata adopt` if you want upgrades to keep it
updated.

## The seams

The reason an upgrade can replace most files is that you should not need to edit
them. Each of these exists so a `managed` file can stay pristine:

| You want to change             | Edit this — never the file it overrides             |
| ------------------------------ | --------------------------------------------------- |
| A colour, radius, shadow, ramp | `src/modules/app/styles/brand.css`                  |
| Any interface string           | `src/modules/app/locales/<locale>.overrides.json`   |
| Product name, footer links     | `src/modules/app/config/app.overrides.ts`           |
| The logo                       | `src/modules/app/components/Logo.vue` — it is yours |
| Where any of the above lives   | `vuestrata.config.json`                             |

Editing `semantic.css` instead of `brand.css` is not forbidden. It just means
that file is now yours, an upgrade will stop updating it, and every release will
report it. That is a fine trade if you meant it and an expensive surprise if you
did not.

## Moving things

Nothing above has to sit where Vuestrata put it. The tooling addresses files by
_slot_ — `moduleRegistry`, `uiComponents`, `appLocales` — and resolves each to a
path.

There is no `vuestrata.config.json` until you need one: an untouched project's
paths already match the defaults, and a generated copy of them would say nothing
new and go stale on the first release that moved something. When `doctor`
reports a slot that no longer resolves, create the file with **just that slot**:

```json
{ "slots": { "moduleRegistry": "app/modules/registry.ts" } }
```

Everything you leave out keeps its default.

## Registries have two regions

Every registry the tooling writes into carries two marked regions:

```ts
// vuestrata:modules-start    an upgrade writes here
// vuestrata:modules-end
// app:modules-start          `vuestrata add` writes here; upstream never does
// app:modules-end
```

In the three merged files the `vuestrata:` region is simply part of the file an
upgrade replaces. The other registries — `setup.ts`, `nav-groups.ts`,
`theme.config.ts`, `app.css`, `icons/index.ts` and `.env.example` — are your
files, and an upgrade touches only their `vuestrata:` region, append-only:

- It adds what a release adds there, and nothing else. An entry the release
  dropped stays; nothing is reordered; an entry already anywhere in the file is
  not added a second time.
- `.env.example` entries are matched by variable name, so a changed value or
  comment is still the same entry. A comment that documents no variable is not an entry
  and never arrives.
- The lockfile records each region as it was last written. If you have edited
  one since — removed an entry on purpose, say — the upgrade leaves it alone and
  tells you what it would have added, rather than undo your change.

Keep both pairs of markers. Deleting them does not break the build — it means
whatever a release wanted to add there silently never arrives. `vuestrata
doctor` reports any that have gone missing.

## Taking a version by hand

When an upgrade leaves a file in `.vuestrata/incoming/`, merge what you want
from it into your copy, then record the result as clean:

```bash
vuestrata adopt src/modules/app/components/ui/UiButton.vue
```

From then on the file updates again. Given a registry, `adopt` re-records its
`vuestrata:` region instead, so later releases can append to it again.

Adopting says the file now matches Vuestrata, so any difference you leave in it
counts as Vuestrata's and goes the next time that file changes upstream. Move a
change you want to keep into a seam first; `adopt` warns when the file still
differs from the release.

## Starting from a clean slate

```bash
vuestrata eject
```

Removes the demo modules (all but `customers`, the reference implementation), the
marketing home page, the component showcase and the documentation site, and
unwires them from the module registry. Their permissions are withdrawn in
`src/modules/app/config/rbac.overrides.ts`, which is yours; eject never edits a
file Vuestrata owns, so `core/lib/rbac/` keeps receiving upgrades. It deletes the
tests and end-to-end specs that covered what went, rewrites the `docs/` links in
`README.md`, `CONTRIBUTING.md` and `SECURITY.md` to the tagged upstream copy,
prunes the dependencies only the docs site used, removes the maintainer-only
files (`packages/cli`, the release gates and workflows, the CLI tests), points
the `gen:*` scripts at the installed `vuestrata` bin, and writes a placeholder
home route.

Every removed path is recorded in the lockfile's `ejected` list, so no future
upgrade puts any of it back.

It removes what the template shipped, and leaves what you wrote beside it:

- In `docs/`, only the pages listed under `docs` in `vuestrata.lock.json`, which
  are the ones the template shipped. A runbook or a decision record you added
  stays, and so does the folder. A lockfile from before 1.1.0 has no such list;
  the installed CLI's own list stands in for it, and with neither, `docs/` is
  kept whole.
- The home route becomes the placeholder only while it still imports the
  marketing sections. A landing page of your own is left alone, and so are the
  specs that test it.
- An end-to-end spec is deleted only when no test is left in it. A test eject
  cannot read (one declared through a fixture imported from another file, say)
  is kept, and named in the output if it still visits a removed route.
- A `package.json` script goes only if it runs something that was removed. One
  that merely shares a name with a template script (`release:*`,
  `lint:maintainer`) stays.

Running it a second time changes nothing.

`--keep <ids>` keeps named modules; `--no-keep-customers` removes `customers` too;
`--keep-docs` keeps `docs/`; `--dry-run` prints the plan. Run `vp install` afterwards
to bring `pnpm-lock.yaml` in line with the pruned dependencies.

## Adopting the CLI late

A project that started before `@vuestrata/cli` existed has no lockfile, so run:

```bash
vp exec vuestrata init
```

One caveat, and it is worth reading twice. `init` records the files **as they
are now** as the baseline. If you had already restyled `UiButton.vue`, that
edit is recorded as though Vuestrata shipped it, and the next upgrade will
replace it without asking.

That is the right trade — the alternative is tracking nothing at all — but if
you have made changes you care about, compare against the release you started
from first:

```bash
git diff v1.0.1-alpha.6 -- src/modules/app/components/ui/
```

Anything that turns up there is an edit `init` is about to forget. Either
re-apply it after the upgrade, or move it into one of the seams above so it
stops being an edit at all.

## When something goes wrong

```bash
vuestrata doctor
```

Checks that every slot in `vuestrata.config.json` resolves, that every registry
still has its markers, that every seam Vuestrata's code imports is still there,
and that the lockfile agrees with what is on disk. It also names the files an
upgrade will not be able to take over for you: shipped files you have but that
are not tracked, waiting for `vuestrata adopt`. Run it before an upgrade, not
during one.

`upgrade` refuses to run on a dirty working tree, because `git checkout .` is
the entire recovery plan and it only works from a clean one. `--allow-dirty`
overrides that if you know better.

## Version history

Versions are listed newest first. Anything requiring a decision you have to make
yourself is called out; everything else is applied by `vuestrata upgrade`.

### 1.1.0

1.1.0 moves the plumbing most fixes land in (the auth store and adapters, the
boot sequence, the route guard, the build and header scripts) into Vuestrata's
care, and fixes sessions, the API client, the error screens and the Docker
image. `CHANGELOG.md` lists it all. This is what to do, in order.

#### The order

```bash
vp add -D @vuestrata/cli@1.1.0-alpha.0   # the CLI is the release
vp exec vuestrata doctor                 # is anything in the way?
git status                               # commit or set aside your work first
vp exec vuestrata diff                   # what would change; writes nothing
vp exec vuestrata upgrade
```

1. **Read the notes.** The upgrade ends with a "Needs a person" list. Each line
   is one thing it could not decide for you, with the change to make. Nothing
   else in its output asks for anything.
2. **Regenerate the security headers**, if the notes say the header generators
   were replaced (they are, unless you edited `scripts/security/headers.mjs` or
   `sync-headers.mjs`):

   ```bash
   vpr security:headers
   ```

   It rewrites `public/_headers`, `docker/*.conf`, the `headers` block of
   `vercel.json` and the CSP `<meta>` in `index.html`. `vpr lint` reports drift
   until you do.

3. **`vp install`**, only when `package.json` changed its dependencies. 1.1.0
   changes none, so there is nothing to install.
4. **Run the gates.**

   ```bash
   vp build                 # once: regenerates the route and import typings
   vp check
   vpr lint
   vpr test --run
   vpr build && node scripts/build/verify-bundle.mjs --mode=production
   vp exec vuestrata doctor
   ```

   Build with your production variables for the last but one. A project that
   edited nothing passes all six.

Running the upgrade a second time changes nothing, and so does each 1.1.0
prerelease after the first: every step looks for what is still to do.

#### What it does for you

- Replaces every managed file you have not edited, and writes the new ones:
  `src/modules/app/bootstrap/`, `AppRoot.vue`, `AppErrorBoundary.vue`,
  `core/lib/api/{failure,retry}.ts`, `core/lib/rbac/{identity,overrides}.ts`,
  `core/lib/errors/vue-error-info.ts`, `auth/lib/safe-redirect.ts` and
  `scripts/vite/vuestrata-plugin.{mjs,d.mts}`.
- Takes over the files that became managed, where your copy is one a release
  shipped: the auth store and `api-runtime` store, the auth adapters and
  `auth/lib`, `useAuth`, `useRbac`, `runtime-backends.ts`, `build-info.ts`,
  `route-guard.ts`, `session-restore.ts`, `plugins/vue-query.ts`, the mock
  helpers, `types/{forms,button-group}.ts`, the three locale catalogs,
  `verify-bundle.mjs`, `write-version.mjs` and the two header generators (as a
  pair).
- Turns `src/main.ts` into `boot(App)` and `src/App.vue` into `<AppRoot />`,
  when they are still what 1.0.1-alpha.5 or 1.0.1-alpha.6 shipped. If you had
  tuned `plugins/vue-query.ts`, the new `main.ts` passes your options:
  `boot(App, { queryOptions: vueQueryOptions })`.
- In `vite.config.ts`, replaces the inline env plugin with an import of
  `scripts/vite/vuestrata-plugin.mjs`, and gives an unedited test block
  `testTimeout: 15_000` and, off CI, `maxWorkers: '50%'`.
- Records the `Ui*` barrel, the forms barrel and `core/lib/rbac/types.ts` as
  merged files, keeping what `vuestrata add` wrote into their `app:` regions.
- Writes `src/modules/app/config/rbac.overrides.ts`.
- Takes `&& node scripts/release/check-template-lock.mjs` out of the `lint`
  script in `package.json`.
- In `plugins/router.ts`, `plugins/stale-chunk.ts` and
  `src/modules/auth/pages/login.vue`, replaces the lines this release changed,
  where they are still the shipped lines. The rest of each file is not
  compared, so a layout you added to `router.ts` does not hold the fix back.
- Rewords the lines that quoted the demo account or the demo store names in
  `docs/6.configuration/2.auth-rbac.md`, `3.auth-deep-dive.md`,
  `docs/8.deployment/1.vercel-demo.md` and
  `src/modules/showcase/pages/forms.vue`, and makes `e2e/forms.spec.ts` follow
  the page.
- Updates eight tests that asserted what 1.0 did (`test/stores.test.ts`, the
  two `use-rbac` tests, `adapters.test.ts`, `oauth-pkce.test.ts`, and the
  `public-surface`, `registry-drift` and `module-contract` architecture tests).
- Replaces `Dockerfile`, `docker-compose.yml`, `.dockerignore`,
  `.github/dependabot.yml`, `.github/workflows/ci.yml`,
  `e2e/production-artifact.spec.ts` and `scripts/lint/check-toolchain-pins.mjs`
  when they are unedited.
- Splits every `gen:<region>` sentinel into a `vuestrata:` / `app:` pair, for a
  project that comes from before 1.0.1-alpha.5. Whatever was inside the old
  region moves to the `app:` half, where nothing upstream will ever write.

#### What it leaves in `.vuestrata/incoming/`, and why

A file you edited is never overwritten. The release's version is written to
`.vuestrata/incoming/<path>`, and a note says what it carries:

| You edited                                                  | You keep                                                     | Until you merge it                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A managed file, or one that became managed                  | Your copy, and that file's 1.0 behaviour                     | Fixes to that file do not reach you                                                                                                                              |
| `src/main.ts`, `src/App.vue`                                | Your copy and the old boot sequence                          | Fixes to the boot order, the auth wiring and the root error handling do not reach you                                                                            |
| `headers.mjs` or `sync-headers.mjs`                         | Both, as they were: they are replaced together or not at all | No gzip, `/healthz`, JSON `502` or cache policy in the image. `e2e/production-artifact.spec.ts` is held back too, because its assertions describe the new config |
| `Dockerfile`, `ci.yml` and the other container and CI files | Your copy                                                    | One note lists what changed in each                                                                                                                              |
| `core/lib/rbac/inheritance.ts`                              | Your copy, which does not read `rbac.overrides.ts` grants    | Move your edits into `grants` in `rbac.overrides.ts`, then take the incoming file                                                                                |
| A merged file, outside its `app:` regions                   | Your copy                                                    | The incoming copy already holds your `app:` entries                                                                                                              |

A project-owned file whose changed lines you had rewritten (`router.ts`,
`login.vue`, a docs page, a test) gets no incoming copy: the note gives the
change itself.

Merge what you want from the incoming copy, then tell the CLI the file is clean:

```bash
git diff --no-index src/modules/app/stores/auth.ts .vuestrata/incoming/src/modules/app/stores/auth.ts
# edit your copy until it holds what you want from both
vp exec vuestrata adopt src/modules/app/stores/auth.ts
```

`adopt` records the file as it is now as Vuestrata's, so later releases update
it again. It warns when the file still differs from the release: whatever
difference you leave is replaced the next time that file changes upstream. Put
anything you want to keep into a seam first (`brand.css`,
`<locale>.overrides.json`, `app.overrides.ts`, `rbac.overrides.ts`,
`boot(App, { beforeMount })`). For the two header generators, adopt both, then
run `vpr security:headers`. Delete `.vuestrata/incoming/` when you are done; it
is not tracked by the lockfile.

#### What needs you

**1. A cross-origin API must allow credentials.** This is the one change that
can break a deployment that works. Under the default
`VUESTRATA_SESSION_PERSISTENCE` (`refresh-cookie`), the `jwt` adapter now sends
cookies on its `/auth/*` requests, which is what makes the refresh cookie work
at all. If your API is on another origin than the app, it must answer those
requests with:

```http
Access-Control-Allow-Origin: https://app.yourcompany.com
Access-Control-Allow-Credentials: true
```

The origin must be the exact one, not `*`: a browser refuses a credentialed
response that answers `*`, and the login fails. If your backend sets no refresh
cookie, choose another mode and nothing changes:

```bash
VUESTRATA_SESSION_PERSISTENCE=session   # or none, or local
```

A same-origin API (`VUESTRATA_API_URL=/api`) needs neither.

**2. `src/main.ts`, if you edited it.** Yours keeps working with the old boot
sequence. To move over, replace it with the shell and put what you added into
`beforeMount`:

```ts
import { boot } from '@/bootstrap'

import App from './App.vue'

import '@/styles/app.css'

void boot(App, {
  beforeMount: (app) => {
    app.use(MyPlugin)
  },
})
```

Query client options go in `queryOptions`, which replaces the shipped options
whole (`vueQueryOptions` in `bootstrap/query-client.ts`). Keep the retry policy
in yours:

```ts
import { boot } from '@/bootstrap'
import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'

void boot(App, {
  queryOptions: {
    queryClientConfig: {
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          gcTime: 5 * 60_000,
          retry: shouldRetryQuery,
          retryDelay: queryRetryDelay,
          refetchOnWindowFocus: true,
        },
        mutations: { retry: false, retryDelay: queryRetryDelay },
      },
    },
  },
})
```

`src/App.vue`, if you edited it, becomes `<AppRoot />` with your additions
around or beside it.

**3. `plugins/vue-query.ts`, if you edited it and kept your own `main.ts`.**
The API client no longer retries, so the old `retry: 1` is one retry for every
failed query, `404` included. Set:

```ts
import { queryRetryDelay, shouldRetryQuery } from '~/lib/api/retry'

// queries
retry: shouldRetryQuery,
retryDelay: queryRetryDelay,
// mutations
retry: false,
```

**4. `plugins/router.ts`, if you rewrote its `afterEach`.** Import
`START_LOCATION` from `vue-router` and make the hook:

```ts
router.afterEach((_to, from, failure) => {
  NProgress.done()
  if (!failure && from !== START_LOCATION) clearStaleChunkMarker()
})
```

Without it, a route whose chunk is really gone reloads the page on every click
and never reaches the error state.

**5. `plugins/stale-chunk.ts`, if you edited it.** `markReloadAttempted()`
returns whether the attempt was recorded, and the reload is skipped when it was
not. Keep exporting `isStaleChunkError`: the error boundary imports it.

```ts
function markReloadAttempted(): boolean {
  try {
    const at = String(Date.now())
    sessionStorage.setItem(RELOAD_MARKER_KEY, at)
    return sessionStorage.getItem(RELOAD_MARKER_KEY) === at
  } catch {
    return false
  }
}
```

and in `handleStaleChunkError()`, before the warning:

```ts
if (!markReloadAttempted()) {
  staleChunkLogger.error(
    'A route chunk is missing, and the reload that would fix it cannot be recorded in ' +
      'sessionStorage. Not reloading — an attempt nothing remembers would repeat for ever.',
    { err: error },
  )
  return false
}
```

leaving `reload()` and `return true` after the warning.

**6. The login page, if you restyled it.** An expired session now arrives as
`/auth/login?redirect=<path>&reason=expired`. In the script:

```ts
const reason = useRouteQueryParam('reason')
const sessionExpired = computed(() => reason.value === 'expired')
```

and above the error message in the template:

```vue
<div v-if="sessionExpired" role="status">
  {{ t('auth_session_expired') }}
</div>
```

**7. `state/runtime-backends.ts`, if you edited it.** Your copy does not install
`rbac.overrides.ts`, so its permissions, grants and withdrawals have no effect,
and `vuestrata doctor` warns. Add:

```ts
import rbacOverrides from '~/config/rbac.overrides'
import { resolveRbacOverrides } from '~/lib/rbac/overrides'
import { installRbacConfig } from '~/lib/runtime'

const rbacConfig = resolveRbacOverrides(rbacOverrides)

// where BUILTIN_PERMISSIONS is derived
resolveRolePermissions('super_admin', rbacConfig)

// in installRuntimeBackends(), before installRbacBackend()
installRbacConfig(rbacConfig)
```

**8. `vite.config.ts`, if you edited the inline env plugin.** Delete the
`vuestrataEnv` function and the imports only it used, and import the managed
one. Without it the dev-server proxy (`DEV_API_TARGET`) never runs.

```ts
import { vuestrataEnv } from './scripts/vite/vuestrata-plugin.mjs'
```

**9. Demo literals.** `verify-bundle --mode=production` now fails when any
chunk, your docs pages included, contains `demo@vuestrata.dev`,
`vuestrata-demo-auth` or `vuestrata-demo-v1`. A note names each file and
literal the upgrade could not reword. Name the constant that holds the value
(`DEMO_ACCOUNT`, `DEMO_DB_NAME`) instead of the value.

**10. The copy of the CLI in your repository.** `packages/cli`,
`scripts/release` and `test/unit/cli` came with the template at the version you
cloned, and no upgrade updates them. The `gen:*` scripts in `package.json` still
run that copy, whose `add module` writes permissions where 1.0 kept them. Use
the installed CLI:

```bash
vp exec vuestrata add module invoices
```

`vuestrata eject` removes the template's own copy and points the scripts at the
installed one. If you edited `.github/workflows/ci.yml`, delete its
`cli-roundtrip` job, which tests that old copy.

**11. Code that reads errors or permissions.**

- `apiFetch` rejects only with `AppError`. Read `status`, `code`, `details` and
  `kind` where you read ofetch's `FetchError`. A request that got no response
  is `NETWORK_ERROR`, `TIMEOUT` or `ABORTED` with status `0`, not
  `RUNTIME_ERROR` with `500`.
- `useAuthStore().userPermissions` is what the user effectively holds. To ask
  whether the backend sent permissions at all, read `user.permissions`.
- A user with a role and no `permissions` can now open the routes the role
  grants. If you relied on the guard refusing them, send `permissions: []`.
- A boot test of your own that passes a fake router needs three more members:

  ```ts
  onError: () => () => undefined,
  afterEach: () => () => undefined,
  currentRoute: { value: START_LOCATION },
  ```

**12. `package.json` `engines`, if you want it.** The template now declares
`"node": "^22.22.2 || ^24.15.0 || >=26.0.0"`, the range jsdom 30 needs for the
tests to start. Yours is left as it is.

**13. `UiToast`**, for a project that comes from before 1.0.1-alpha.5, emits
`show` instead of calling the notification store itself. If you used it, pass a
handler:

```vue
<UiToast variant="info" title="Saved" message="Done." @show="notifications.add" />
```

The old behaviour made a `Ui*` wrapper depend on an application store, which is
the one dependency that makes a component impossible to update independently of
the app around it.
