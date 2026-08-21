# Product

## Register

product

## Product Definition

Vuestrata is an opinionated Vue application foundation designed to catch
architectural mistakes before they ship.

Short supporting line:

> Modern Vue tooling, enforced architecture, generators, and 12 distinct design
> personalities in one codebase.

Category, for search and discovery: a Vue 3 starter template. That is what it
_is_; it is not why anyone should pick it.

## Users

Frontend and fullstack developers, and small teams, starting a real Vue
application. They already know Vue — they are not here to learn it. They are
technical, opinionated, and time-constrained, and they reach for a foundation to
avoid rebuilding routing, state ownership, API access, auth, theming,
permissions, mocks, testing and deployment configuration for the fourth time.

What characterises them:

- They value conventions, and they value conventions that are checked more.
- They expect the application to grow, and they have paid for architectural
  drift before.
- They care about maintainability over demo-only visual polish.
- Many of them work alongside coding agents, and want a repository whose rules
  an agent can read and a gate can enforce.

Primary context: a local dev environment or a team kickoff. High intent, low
patience for ceremony.

## Core Problem

Starting a Vue project is easy. Keeping routing, state, modules, API access,
authentication, themes, permissions, mocks, testing, accessibility, deployment
configuration and architectural conventions consistent as the application grows
is the expensive part.

The specific failure Vuestrata is built around: **the conventions that matter
most fail silently.** A module never added to `setup.ts` does not throw — the
feature simply never loads. A theme wired into three of its four files does not
throw — it renders the default palette, or worse, the right accents over the
wrong surfaces. A nav item pointing at a group that does not exist does not
throw. `mockHandlers` declared unconditionally does not throw — it ships MSW to
real users. Documentation cannot prevent any of these, because nothing fails
until someone notices.

Vuestrata exists to make that foundation explicit and mechanically verifiable.

## Differentiators

### 1. Enforced architecture

Conventions are executable, not aspirational. Six custom lint rules
(`scripts/lint/plugins/`) cover module-scope mutable state, raw palette
utilities (on a bidirectional ratchet), inline template handlers, i18n key
parity across `en`/`fr`/`ar`, icon-name parity across providers, and the four
files a theme must appear in. Four architecture tests
(`test/unit/architecture/`) cover module registry drift, the module contract,
docs registration, and demo-only access. `no-restricted-imports` enforces the
dependency direction: barrels are the public API, `core/lib` stays
framework-agnostic, pages stay out of the data layer. `verify-bundle.mjs`
asserts what actually reached the artifact.

The claim is not that every convention is enforced. It is that the ones whose
failure is silent are.

### 2. Twelve design personalities, not twelve colour palettes

Every theme redefines the same custom-property vocabulary over one component
layer: full primary/secondary/accent/surface ramps, radius scales, and shadow
or offset-ink elevation, in both colour modes. Eight of the twelve also change
the body typeface; two change border weight; four ship their own chart palette;
two add theme-local drawing primitives. Components never query the theme name —
they read tokens — so a screen that works in Default works in Terminal.

### 3. Explicit production and demo boundaries

`VUESTRATA_RUNTIME_MODE` decides whether MSW and the demo state are in the
bundle at all, and `verify-bundle.mjs` proves the demo code was compiled out
rather than merely left unused. The same switch is why the public demo can be
deployed with no backend, no database and no secrets.

### 4. Typed data and application infrastructure

Server state follows a single TanStack Query convention with typed
`[module, resource, ...params]` keys and a shared collection contract, instead
of letting every feature invent its own loading, caching and invalidation model.
`ofetch` stays the low-level client. Environment configuration is validated by
one zod schema. Auth is one explicit contract with declared transport and
capability flags across the `mock`, `jwt` and `oauth` adapters, so the UI hides
what the configured adapter cannot do rather than discovering it at click time.

### 5. Testing, security and accessibility guardrails

Vitest across unit, component and integration layers with enforced coverage
thresholds; Playwright for journeys, run against the built artifact and against
the production Docker image in CI. axe runs on `critical` and `serious` across
themes, colour modes and RTL. Security headers are generated from one
definition into four targets with CI failing on drift, and the Node, pnpm and
Vite+ pins are checked the same way.

### 6. Agent-legible conventions

`AGENTS.md` is a single canonical brief, the module contract is explicit, and
the extension paths have generators with `--dry-run` and `--json` plans. The
same explicit rules that help a developer understand the repository also make a
coding agent less likely to violate its architecture — and the gates catch it
when either one does.

## Readiness Position

"Is it production ready?" is three questions wearing one coat, and Vuestrata
answers them separately in [`docs/9.readiness.md`](docs/9.readiness.md): the
public demo is ready to deploy, the template is ready to start a project from,
and the production readiness of _your_ application depends on your backend and
your infrastructure. The repository documents its own known gaps rather than
implying it removes risk it cannot remove.

The project is in an alpha release train. The demo and the template are usable
today; conventions and the public surface may still change between alpha
releases. See [`RELEASE.md`](RELEASE.md).

## Brand Personality

Precise, fast, opinionated.

Voice: direct, confident, no filler. Like a good API error message — it tells
you exactly what happened and what to do. Never apologetic, never hand-holdy.
Claims are specific enough to be checked; a claim that cannot be checked is not
worth making.

## Anti-references

- **Bootstrap admin dashboards** — heavy card grids, same-weight nav items, muted gray everywhere, table-overload layouts.
- **Vercel / Next.js marketing templates** — soft SaaS cream gradients, "hero + feature cards + CTA" cookie-cutter structure, aspirational copy divorced from function.
- **Cluttered Material Design** — too many layers, too much shadow, icon-overload toolbars, density that reads as noise not information.
- **Generic SaaS dashboards** — hero metrics with big numbers + gradient accents, sidebar with identical icon+label rows, identical card grids with icon+heading+body.

## Strategic Design Principles

1. **Function-first density.** Information at the right density — not sparse (wasteful) and not packed (fatiguing). Every element earns screen real estate.
2. **Theme-system integrity.** The default theme must look deliberate, not like a wireframe. All 12 built-in themes must demonstrate range, not just hue swaps.
3. **Developer-credibility signals.** Monospace type, clean borders, sharp radius — this is a tool for people who will inspect the source. It must hold up to scrutiny.
4. **No decorative overreach.** Motion, color, and shadow serve communication. Never deployed for atmosphere alone.

## Accessibility

WCAG 2.1 AAA target. All interactive elements keyboard-accessible. Reduced motion respected via `prefers-reduced-motion`. RTL layout support (Arabic locale already wired).
