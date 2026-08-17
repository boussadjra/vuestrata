# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It is the canonical brief: repo map,
architecture rules, state ownership, what each gate catches, quality gates, and
the toolchain rules. This file only adds what is specific to working here with
Claude Code.

Highest authority above `AGENTS.md`: `.specify/memory/constitution.md`.

## The one thing that trips people up

This project uses **Vite+**, not plain npm scripts. The CLI is `vp`.

- `vp <name>` runs a **built-in** (`vp check`, `vp lint`, `vp fmt`, `vp test`,
  `vp build`, `vp dev`).
- `vp run <name>` runs a **`package.json` script or `vite.config.ts` task**.
- The two can differ for the same name. Check `package.json` before guessing.
- Never `pnpm`, `npm`, `yarn`, `bun`, or `npx`. For one-off binaries: `vp dlx`.
- There is no `vp vitest` or `vp oxlint`.

## Slash commands

| Command          | What it does                         |
| ---------------- | ------------------------------------ |
| `/add-module`    | Scaffold a CRUD domain module        |
| `/add-page`      | Add a page to an existing module     |
| `/add-theme`     | Scaffold a theme                     |
| `/add-component` | Scaffold a `Ui*` wrapper             |
| `/add-icon-set`  | Scaffold an icon provider            |
| `/verify`        | Run the right gates for what changed |

## Verifying

```bash
vp check                                   # format, lint, types
node scripts/lint/run-custom-rules.mjs     # six project-specific rules
vp test --run                              # includes test/unit/architecture/
```

Add `vp build` when routing, layouts, config, providers or runtime wiring
changed; `vp run test:e2e` when a user-visible flow changed.

`vp check` is slow enough (tens of seconds) that it is not worth running after
every single edit — run it before you report work as done.

`.claude/settings.json` runs `vp check` on a `Stop` hook, mirroring what
`.github/hooks/hooks.json` already does for Copilot. If that is too heavy for
your workflow, delete the `hooks` block — the CI gates are the real boundary.
The `permissions.allow` list beside it is what stops the read-only verification
commands prompting every time.

## Testing Reka-backed components

Two jsdom gaps bite repeatedly, both already handled in `test/setup.ts`:

- **Pointer Capture** is unimplemented, so any Reka primitive that captures the
  pointer (Select, Slider) dies on `hasPointerCapture is not a function`.
- **Portalled content** (`SelectPortal`, dialogs) teleports to `document.body`,
  outside the wrapper. `wrapper.findAll` will never see it — query `document`.

Reka commits selection on `pointerup`, not `click`, and jsdom has no
`PointerEvent` constructor; dispatch a `MouseEvent` named `pointerup` instead.
See `selectRole` in `test/component/users/user-management-components.test.ts`.

Do not "fix" a failing component test by mocking Formwerk. `ui-fields-basic.test.ts`
mocks it wholesale, which is exactly why two real bugs in `UiCheckbox` survived
in a suite that looked green.
