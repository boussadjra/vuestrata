# Copilot Instructions

**Read [`AGENTS.md`](../AGENTS.md) first.** It is the canonical brief for this
repo: the repo map, the architecture rules, the state-ownership policy, what
each lint gate catches, the quality gates, and the `vp` toolchain rules.

This file used to repeat all of that. It no longer does — two copies of a rule
drift, and the copy a given agent happens to read decides which version of the
codebase it writes.

## Copilot-specific notes

- **Highest authority** is `.specify/memory/constitution.md`. Read it before
  major implementation and flag conflicts rather than silently violating them.
- **Skills** live in `.github/skills/`: the domain set
  (`vuestrata-spec-workflow`, `vuestrata-quality-gates`,
  `vuestrata-module-organization`, `vuestrata-docs-parity`,
  `vuestrata-auth-contract-checks`), the `speckit-*` workflow set, and the
  `i-*` design set.
- **Custom agents** for the spec workflow are in `.github/agents/`; their bodies
  live in `.specify/templates/commands/`.
- **Hooks** in `.github/hooks/hooks.json` run `vp check` after each file edit
  and `vp check` + `vp test --run` at session end. That is a Copilot-schema
  file; it does not apply to other harnesses.
- **Planning**: prefer lightweight implementation notes for non-trivial changes
  over mandatory spec-folder scaffolding. Templates remain in
  `.specify/templates/` if structured documentation is warranted.

## Before you finish

```bash
vp check                                   # format, lint, types
node scripts/lint/run-custom-rules.mjs     # the six project rules
vp test --run                              # includes test/unit/architecture/
```

Add `vp build` when routing, config, providers or runtime wiring changed, and
`vp run test:e2e` when a user-visible flow or route changed.
