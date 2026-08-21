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

| Command                       | What it does                                                                |
| ----------------------------- | --------------------------------------------------------------------------- |
| `vuestrata doctor`            | Can this project still be upgraded, and what will an upgrade skip?          |
| `vuestrata diff`              | Show exactly what an upgrade would change. Writes nothing.                  |
| `vuestrata upgrade`           | Run migrations and install this release, preserving files you edited.       |
| `vuestrata add <kind> <name>` | Scaffold a module, page, component, theme or icon set — and its registries. |
| `vuestrata eject`             | Remove the demo modules, showcase and docs site, and stop tracking them.    |
| `vuestrata init`              | Start tracking a project that predates the CLI.                             |

Every command takes `--dry-run` and `--json`.

## How an upgrade decides

Each file the tooling writes declares who owns it, and `vuestrata.lock.json`
records a hash of what was written there. That hash is the whole mechanism — it
is what tells an untouched file apart from one you spent a week restyling.

- **Hash matches** — nobody touched it, so replacing it loses nothing.
- **Hash differs** — you edited it. Your version stays, and the new one is
  written to `.vuestrata/incoming/<path>` with the `git diff --no-index` command
  printed so you can decide what to take.
- **Not tracked** — yours outright. Never touched, never reported.

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
