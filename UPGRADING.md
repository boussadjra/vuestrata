# Upgrading

Vuestrata is a template you own a copy of, not a dependency you resolve. That
normally means upstream improvements never reach you — you forked, you changed
things, and a `git merge` would collide on every file both sides touched.

`@vuestrata/cli` exists to make that not true.

```bash
vp add -D @vuestrata/cli   # once
vuestrata init             # once, in an existing project
vuestrata diff             # what would change
vuestrata upgrade          # do it
```

## The one idea

Every file the tooling writes belongs to exactly one side, and it says which.

| Class     | Who owns it                     | What `upgrade` does                                       |
| --------- | ------------------------------- | --------------------------------------------------------- |
| `managed` | Vuestrata                       | Replaces it — unless you edited it, then hands you a copy |
| `seeded`  | You, from the first write       | Never touches it again                                    |
| `merged`  | You, except one anchored region | Edits only inside the markers                             |

`vuestrata.lock.json` records the class of every file plus a hash of what was
written there. That hash is the whole mechanism: it is what distinguishes a file
nobody touched from one you spent a week restyling.

- **Hash matches** → replacing it loses nothing, so it is replaced.
- **Hash differs** → you edited it. Your version stays. The new upstream version
  is written to `.vuestrata/incoming/<path>` and the command prints the
  `git diff --no-index` line to compare them.
- **Not in the lock** → yours outright. Untouched, and never reported.

Nothing is ever overwritten on a guess.

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

Keep both pairs of markers. Deleting them does not break the build — it means
whatever a release wanted to add there silently never arrives. `vuestrata
doctor` reports any that have gone missing.

## Starting from a clean slate

```bash
vuestrata eject
```

Removes the nine demo modules, the marketing home page, the component showcase
and the documentation site, unwires them from the module registry, withdraws
their permissions from the closed `BuiltinPermission` union and from the roles
that were granted them, deletes the tests that covered them, and writes a
placeholder home route.

Every removed path is recorded in the lockfile's `ejected` list, so no future
upgrade puts any of it back.

`--keep <ids>` keeps named modules; `--keep-docs` keeps `docs/`; `--dry-run`
prints the plan.

## When something goes wrong

```bash
vuestrata doctor
```

Checks that every slot in `vuestrata.config.json` resolves, that every registry
still has its markers, and that the lockfile agrees with what is on disk. Run it
before an upgrade, not during one.

`upgrade` refuses to run on a dirty working tree, because `git checkout .` is
the entire recovery plan and it only works from a clean one. `--allow-dirty`
overrides that if you know better.

## Version history

Versions are listed newest first. Anything requiring a decision you have to make
yourself is called out; everything else is applied by `vuestrata upgrade`.

### 1.1.0

**Applied automatically.** Every `gen:<region>` sentinel becomes a
`vuestrata:` / `app:` pair, and whatever was inside the old region moves to the
`app:` half — where nothing upstream will ever write.

Before 1.1.0 there was one region per registry and both sides appended to it,
which collided on every upgrade in the files whose breakage is silent: a module
missing from `setup.ts` does not throw, the feature simply never loads.

**Worth knowing:** `UiToast` now emits `show` instead of calling the
notification store itself. If you used it, pass a handler:

```vue
<UiToast variant="info" title="Saved" message="Done." @show="notifications.add" />
```

The old behaviour made a `Ui*` wrapper depend on an application store, which is
the one dependency that makes a component impossible to update independently of
the app around it.
