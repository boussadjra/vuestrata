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
