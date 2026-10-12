# @vuestrata/cli

Scaffold, inspect and upgrade a [Vuestrata](https://github.com/boussadjra/vuestrata) project.

Vuestrata is a template you own a copy of, not a dependency you resolve. The code
lives in your repository, you edit it, and there is no `node_modules` folder to
swap out — so upstream fixes normally never reach you. This CLI is what makes
them reach you anyway.

```bash
vp add -D @vuestrata/cli
```

## Commands

| Command                       | What it does                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `vuestrata doctor`            | Can this project still be upgraded, and what will an upgrade skip?                                                        |
| `vuestrata diff`              | Show exactly what an upgrade would change. Writes nothing.                                                                |
| `vuestrata upgrade`           | Run migrations and install this release, preserving files you edited.                                                     |
| `vuestrata add <kind> <name>` | Scaffold a module, page, component, theme or icon set — and its registries.                                               |
| `vuestrata add ci`            | Write the CI workflow of a project to `.github/workflows/ci.yml`.                                                         |
| `vuestrata adopt <path>`      | After merging a file from `.vuestrata/incoming/` by hand, count it as clean.                                              |
| `vuestrata eject`             | Remove the demo, showcase, docs site and maintainer-only files, and install the project's CI workflow; keeps `customers`. |
| `vuestrata init`              | Start tracking a project that predates the CLI.                                                                           |

Every command takes `--dry-run` and `--json`.

## The CI workflow

The workflows a project inherits from the template maintain the template: they
test this CLI, publish a release and deploy the hosted demo. `vuestrata add ci`
writes the one a project needs.

```bash
vuestrata add ci                    # writes .github/workflows/ci.yml
vuestrata add ci --dry-run          # prints the plan, writes nothing
vuestrata add ci --branch trunk     # a default branch other than main
vuestrata add ci --force            # replace the workflow that is there
```

It runs on pull requests and on pushes to the default branch, with read-only
permissions: `vp check` and `vp run lint`, the tests with coverage, a production
build verified by `verify-bundle`, the end-to-end suite in Chromium, and the
Docker image built and opened in a browser when the project has a `Dockerfile`.
There is no deploy job.

The production build reads two repository variables, and passes without either:

| Variable                 | Default                         |
| ------------------------ | ------------------------------- |
| `VUESTRATA_API_URL`      | `https://api.vuestrata.invalid` |
| `VUESTRATA_AUTH_ADAPTER` | `jwt`                           |

The file is recorded as yours: `upgrade` never rewrites it and `doctor` never
compares it. A second run writes nothing. When another workflow is in the way,
the command says whether it is the template's, your own, or this one edited,
and writes over it only with `--force`.

`vuestrata eject` installs the same file in place of the template's `ci.yml`,
leaves a workflow you already rewrote alone, and keeps the template's with
`--keep-ci`. A project that does not eject keeps the template's pipeline, whose
maintainer steps are skipped outside the template's repository; `add ci --force`
is how it takes this one.

[CI for Your Project](https://github.com/boussadjra/vuestrata/blob/main/docs/8.deployment/3.ci-for-your-project.md)
describes each job and where a deploy job goes.

## How an upgrade decides

Each file the tooling writes declares who owns it, and `vuestrata.lock.json`
records a hash of what was written there. That hash is the whole mechanism — it
is what tells an untouched file apart from one you spent a week restyling.

- **Hash matches** — nobody touched it, so replacing it loses nothing.
- **Hash differs** — you edited it. Your version stays, and the new one is
  written to `.vuestrata/incoming/<path>` with the `git diff --no-index` command
  printed so you can decide what to take.
- **Not tracked** — yours outright. Never touched, never reported.

Three files are both Vuestrata's and a generator's target — the `Ui*` barrel, the
forms barrel and the permission union. They are compared without their `app:`
regions, and an upgrade carries your entries there into the new version.

No generator, and not `eject`, edits a file outside those regions: `add module`
declares a module's permissions in `app/config/rbac.overrides.ts`, and `eject`
withdraws the removed modules' permissions there. Both are yours.

Nothing is ever overwritten on a guess.

## Customise through the seams

An upgrade can only replace a file you never needed to open, so each usual reason
to open one has somewhere else to go:

| To change                      | Edit this                                         |
| ------------------------------ | ------------------------------------------------- |
| A colour, radius, shadow, ramp | `src/modules/app/styles/brand.css`                |
| Any interface string           | `src/modules/app/locales/<locale>.overrides.json` |
| Product name, footer links     | `src/modules/app/config/app.overrides.ts`         |
| The logo                       | `src/modules/app/components/Logo.vue`             |
| Your permissions and grants    | `src/modules/app/config/rbac.overrides.ts`        |
| Your backend's API conventions | `src/modules/app/config/api.overrides.ts`         |
| Header origins, your variables | `src/modules/app/config/deploy.config.ts`         |
| Auth endpoints and adapters    | `src/modules/app/config/auth.config.ts`           |

Those files are yours from the moment you clone; nothing upstream writes to them.

## Moving things

The CLI addresses files by _slot_ — `moduleRegistry`, `uiComponents`,
`appLocales` — rather than by hardcoded path, so it still works in a project that
restructured. Override any slot in `vuestrata.config.json`:

```json
{ "slots": { "moduleRegistry": "app/modules/registry.ts" } }
```

Everything you leave out keeps its default. There is no need for the file until
`vuestrata doctor` tells you a slot no longer resolves.

## Documentation

- [Starting a Project](https://github.com/boussadjra/vuestrata/blob/main/docs/1.getting-started/3.starting-a-project.md) — the walkthrough, from template to your app
- [Upgrading](https://github.com/boussadjra/vuestrata/blob/main/UPGRADING.md) — the mechanism in full
- [Vuestrata](https://github.com/boussadjra/vuestrata) — the template itself

## License

MIT
