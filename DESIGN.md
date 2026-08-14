---
name: Vuestrata
description: A multi-theme Vue 3 enterprise starter — structured defaults, opinionated conventions, ten design personalities in one codebase.
colors:
  # ── Default theme: Workshop Teal (primary) ──────────────────────────────
  workshop-teal-mist: '#eefbf5' # primary-50  — hover tints, input bg tints
  workshop-teal-light: '#b2e8d1' # primary-200 — borders, selected ring
  workshop-teal: '#29a07d' # primary-500 — CTA, interactive accent
  workshop-teal-dark: '#1a8164' # primary-600 — button hover, logo mark
  workshop-teal-deeper: '#14634f' # primary-700 — active state, logo primary
  workshop-teal-ink: '#082620' # primary-950 — darkest ink tint
  # ── Default theme: Raw Linen (secondary) ────────────────────────────────
  raw-linen-pale: '#f8f7f4' # secondary-50  — subtle tinted surfaces
  raw-linen: '#9b8c74' # secondary-500 — secondary buttons, tags
  raw-linen-dark: '#776757' # secondary-700 — secondary hover
  # ── Default theme: Ink Blossom (accent) ─────────────────────────────────
  ink-blossom-pale: '#fbf4fa' # accent-50  — badge tints
  ink-blossom: '#cc62b3' # accent-500 — accent buttons, highlights
  ink-blossom-deep: '#b94999' # accent-600 — accent hover
  # ── Default theme: Graphite (neutral / surface) ──────────────────────────
  graphite-canvas: '#f8fafc' # surface-50  — page background, card bg
  graphite-rule: '#e2e8f0' # surface-200 — borders, dividers
  graphite-mid: '#64748b' # surface-500 — secondary text, placeholder
  graphite: '#334155' # surface-700 — primary text (light mode)
  graphite-deep: '#1e293b' # surface-800 — headings (light mode)
  graphite-void: '#020617' # surface-950 — page bg (dark mode)
  # ── Semantic ─────────────────────────────────────────────────────────────
  danger-signal: '#ef4444' # danger-500 — destructive actions, errors
  danger-signal-dark: '#dc2626' # danger-600 — destructive hover
typography:
  display:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: 'clamp(2.25rem, 5vw, 3.75rem)'
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: '-0.02em'
  headline:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: 'clamp(1.5rem, 3vw, 2.25rem)'
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: '-0.015em'
  title:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: "'Inter', 'Tajawal', 'Cairo', 'Rubik', ui-sans-serif"
    fontSize: '0.875rem'
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.75rem'
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: '0.01em'
rounded:
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
  xl: '0.75rem'
  2xl: '1rem'
  full: '9999px'
components:
  button-primary:
    backgroundColor: '{colors.workshop-teal}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  button-primary-hover:
    backgroundColor: '{colors.workshop-teal-dark}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  button-secondary:
    backgroundColor: '{colors.raw-linen}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.graphite}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  button-ghost-hover:
    backgroundColor: '{colors.graphite-rule}'
    textColor: '{colors.graphite}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  button-destructive:
    backgroundColor: '{colors.danger-signal}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 1rem'
  card:
    backgroundColor: '{colors.graphite-canvas}'
    textColor: '{colors.graphite}'
    rounded: '{rounded.lg}'
    padding: '1.5rem'
  input:
    backgroundColor: '{colors.graphite-canvas}'
    textColor: '{colors.graphite-deep}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  input-focus:
    backgroundColor: '{colors.graphite-canvas}'
    textColor: '{colors.graphite-deep}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
---

# Design System: Vuestrata

## 1. Overview

**Creative North Star: "The Architect's Workbench"**

Vuestrata is a workspace, not a canvas. Every visual decision starts from utility and earns decoration only if it improves communication. The default theme reads like a well-organized drafting table: clean off-white surfaces, a single precise teal accent for interactive elements, warm stone tones for secondary context, and graphite neutrals carrying the structural load. Nothing is placed for atmosphere alone.

The system rejects what PRODUCT.md calls the anti-references by name: Bootstrap admin dashboards with their accordion of padded boxes, Vercel-style marketing templates that prioritize whitespace over density, cluttered Material Design with competing elevation and ripple at every tier, and the generic SaaS dashboard aesthetic of blue gradients and star-rating widgets. Vuestrata is for developers who want production-grade structure, not a style show.

Ten named themes extend this foundation without changing the architecture. Each theme overrides the same CSS custom-property vocabulary — colors, radii, shadows, typeface — so the layout and component structure remain constant. A screen that works in Default works in Terminal. The themes are not skins; they are first-class design personalities, each with its own aesthetic rationale.

**Key Characteristics:**

- Single interactive accent per theme; rarity is the point
- Flat surfaces at rest — depth responds to state, not decoration
- Dense, information-first layouts with clear visual hierarchy
- RTL-native: logical CSS properties throughout (`inset-inline`, `border-inline`, `ltr:`/`rtl:` utilities)
- WCAG 2.1 AAA contrast target across all themes and modes
- All 10 themes support both light and dark mode via `html.dark` class
- Motion respects `prefers-reduced-motion` at the component level

---

## 2. Colors: The Workshop Palette

_The default palette is a craftsman's limited set — one working teal, one warm stone, one florescent accent for emphasis, graphite for structure._

### Primary — Workshop Teal

- **Workshop Teal Mist** (`#eefbf5`): Tinted hover backgrounds, input bg tints, selected row fills. The lightest breath of the primary hue.
- **Workshop Teal** (`#29a07d`): The singular interactive color in the default theme. Used on primary buttons, active nav indicators, focus rings, checked states, and progress fills. Restrained to ≤10% of any given screen.
- **Workshop Teal Dark** (`#1a8164`): Primary button hover, logo mark, link hover.
- **Workshop Teal Deeper** (`#14634f`): Active/pressed state, logo primary word. Anchors the hue family without going cold.
- **Workshop Teal Ink** (`#082620`): Maximum-density ink tint. Used for dark-mode code block backgrounds and extreme depth contexts.

### Secondary — Raw Linen

- **Raw Linen Pale** (`#f8f7f4`): Tinted secondary backgrounds, tag chip fills.
- **Raw Linen** (`#9b8c74`): Secondary buttons, metadata labels, divider-adjacent text. A warm stone neutral that reads as intentionally understated, not forgotten.
- **Raw Linen Dark** (`#776757`): Secondary button hover.

### Accent — Ink Blossom

- **Ink Blossom Pale** (`#fbf4fa`): Badge and chip tints.
- **Ink Blossom** (`#cc62b3`): Accent buttons, highlight decorations, "new" badges. Used sparingly — it reads as a highlighter pen mark, not a signature.
- **Ink Blossom Deep** (`#b94999`): Accent hover.

### Neutral — Graphite

- **Graphite Canvas** (`#f8fafc`): Page background (light), card background (light), input background.
- **Graphite Rule** (`#e2e8f0`): Borders, dividers, table rules, separator lines.
- **Graphite Mid** (`#64748b`): Secondary text, placeholder text, icon default.
- **Graphite** (`#334155`): Primary body text in light mode.
- **Graphite Deep** (`#1e293b`): Headings, strong labels, sidebar text.
- **Graphite Void** (`#020617`): Page background (dark mode).

### Semantic

- **Danger Signal** (`#ef4444`): Destructive buttons, error states, alert badges.
- **Danger Signal Dark** (`#dc2626`): Destructive hover.

### Named Rules

**The One Voice Rule.** In any given theme, the primary color is used on ≤10% of any screen. Its rarity signals authority. Decorating more than one interactive element tier with the primary hue dilutes the entire palette.

**The Stable Ground Rule.** Neutral surfaces never take a tinted background unless a component is in a selected, hovered, or error state. Off-white is the default; color is earned by state.

---

### Theme Variants

The theming engine works by overriding the same `--color-*`, `--radius-*`, `--shadow-*`, and `--font-sans` custom properties on `:root.<theme-class>`. Apply a theme with `class="theme-<name>"` on `<html>`. All 10 themes support `html.dark`.

#### Character Cards

| Theme         | Aesthetic                               | Design Mood                                 |
| ------------- | --------------------------------------- | ------------------------------------------- |
| **Default**   | Teal on slate                           | Precise, professional, neutral              |
| **Blueprint** | Sepia ink on aged parchment             | Drafting board nostalgia, gridded precision |
| **Brutalist** | True B&W, electric yellow + magenta     | Uncompromising, raw, zero decoration        |
| **Febin**     | Coral/orange on warm sunrise surface    | Vibrant twilight, painterly warmth          |
| **Forest**    | Emerald + warm gold on olive            | Grounded, natural, earthy abundance         |
| **Ghibli**    | Forest green + terracotta on warm cream | Whimsical, hand-crafted, serene             |
| **Ocean**     | Deep indigo + cyan on cool slate        | Immersive, professional, coastal depth      |
| **Rose**      | Rose pink + slate purple                | Sophisticated, modern, editorial            |
| **Sunset**    | Amber/orange + deep rose on warm stone  | Energetic, warm, high-vibration             |
| **Terminal**  | Phosphor green on dark charcoal         | Developer-native, monospace, austere        |

#### Full Token Table

| Theme     | Primary-500 | Secondary-500 | Accent-500 | Surface-50 | Radius-md | Body Font         |
| --------- | ----------- | ------------- | ---------- | ---------- | --------- | ----------------- |
| Default   | `#29a07d`   | `#9b8c74`     | `#cc62b3`  | `#f8fafc`  | 0.375rem  | Inter             |
| Blueprint | `#8c6420`   | `#3a66a0`     | `#b65530`  | `#f8f3e6`  | 0         | Bookman Old Style |
| Brutalist | `#303030`   | `#d9c200`     | `#ff1a75`  | `#fafafa`  | 0         | Space Grotesk     |
| Febin     | `#dd7c55`   | `#597ba8`     | `#f23d4e`  | `#fffcf8`  | 0.75rem   | Rubik             |
| Forest    | `#10b981`   | `#c9b210`     | `#14b8a6`  | `#fafaf5`  | 0.625rem  | Inter             |
| Ghibli    | `#4f8058`   | `#c4713a`     | `#4f86a8`  | `#fdfaf4`  | 0.875rem  | Nunito / Fraunces |
| Ocean     | `#6366f1`   | `#06b6d4`     | `#8b5cf6`  | `#f8fafc`  | 0.5rem    | Inter             |
| Rose      | `#f43f5e`   | `#a855f7`     | `#d946ef`  | `#fafafa`  | 0.5rem    | Inter             |
| Sunset    | `#f97316`   | `#f43f5e`     | `#eab308`  | `#fafaf9`  | 0.5rem    | Rubik             |
| Terminal  | `#10b981`   | `#f59e0b`     | `#06b6d4`  | `#d4d4d8`  | 0.25rem   | SF Mono           |

#### Per-Theme Deep Dive

---

**Default** — _The Workbench_
Engineered teal cuts through graphite slate. Radii are tight (md=0.375rem), shadows are ambient, Inter runs the type. The surface is the color of a misted window at first light. This is the reference personality every other theme interprets.

| Token          | Value                       | Notes                             |
| -------------- | --------------------------- | --------------------------------- |
| Primary-50…950 | `#eefbf5` → `#082620`       | Custom teal, not Tailwind emerald |
| Secondary-500  | `#9b8c74`                   | Malta warm stone                  |
| Accent-500     | `#cc62b3`                   | Soft pink-magenta                 |
| Danger-500     | `#ef4444`                   | Semantic only                     |
| Radius-md      | 0.375rem                    | Tight, functional                 |
| Font           | Inter + Tajawal/Cairo (RTL) | Multilingual stack                |

---

**Blueprint** — _The Aged Schematic_
A vintage technical drawing on yellowed quadrille paper. Dark sepia ink for primary actions, blueprint blue annotations for secondary context, aged red correction marks for accents. All radii are zero — precision demands sharp corners. Shadows are hard flat offsets (2px 2px 0), not gaussian. A custom `--blueprint-grid-*` overlay renders graph paper lines on the page background.

| Token         | Value                               | Notes                            |
| ------------- | ----------------------------------- | -------------------------------- |
| Primary-500   | `#8c6420`                           | Dark sepia ink                   |
| Secondary-500 | `#3a66a0`                           | Annotation blue                  |
| Accent-500    | `#b65530`                           | Aged red correction              |
| Surface-50    | `#f8f3e6`                           | Yellowed parchment               |
| Radius        | 0 everywhere                        | No rounding — drafting precision |
| Shadow style  | Hard flat offset (2–4px, 0 blur)    | Paper stacking                   |
| Font          | Bookman Old Style → Georgia → serif | Vintage print stack              |

---

**Brutalist** — _The Manifesto_
Neo-brutalism. Pure black ink on true-neutral paper, black 2px borders on every drawn element, hard offset shadows at zero blur and full opacity, zero rounding. Electric yellow (#ffe600) and electric magenta (#ff1a75) are the only decoration. No glows, no gradients — the page background is flat colour. Space Grotesk carries body and headings. Dark mode is the same theme with the lights off: white and yellow on true black, with the offset shadows inverted to a light tone so they still read.

| Token           | Value                                                      | Notes                                       |
| --------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Primary-500     | `#303030`                                                  | Monochrome ink, graded 50→950               |
| Secondary-500   | `#d9c200` (signature step is 400, `#ffe600`)               | Electric yellow                             |
| Accent-500      | `#ff1a75`                                                  | Electric magenta — moved off red, see below |
| Surface-50/950  | `#fafafa` / `#000000`                                      | True neutral, no blue cast                  |
| Radius          | 0 everywhere, incl. the `--shape-radius-*` scale           | Structural rejection of softness            |
| Border          | `--color-border` → black; `--shape-border-width` → 2px     | The border IS the design                    |
| Shadow style    | Hard offset (3–7px, 0 blur, 100% opacity), mirrored in RTL | Constructivist                              |
| Font            | Space Grotesk                                              | Mono is confined to `--font-mono`           |
| Dark mode delta | Filled controls → yellow; borders → grey; shadows → light  | Same identity, inverted                     |

Three deliberate departures from the previous version:

- **Accent left red.** The old `#ef4444` sat one hue step from `--color-danger-*`, so an accent chip and a destructive button were the same colour, and `--color-chart-2` collided with the danger palette. Magenta is distinct from every other ramp in the system.
- **Dark mode dropped the phosphor green.** `#00ff00` was the Terminal theme's identity, not this one — it turned Brutalist into a second Terminal on mode switch rather than a dark Brutalist.
- **The radius and border tokens are set on the SHAPE scale too.** Cards, buttons, inputs and the auth panel round themselves from `--shape-radius`, not `--radius-*`, so zeroing only the latter left every panel soft. The `:root.shape-*` presets still override, so a user's explicit shape preference keeps working.

---

**Febin** — _The Windmill at Dusk_
Inspired by vibrant windmill sunset art. Soft coral/orange primary (#dd7c55), twilight slate-blue secondary (#597ba8), deep crimson accent. The surface is a warm glowing sunrise (#fffcf8). Radii are large (sm=0.5rem, 2xl=2rem) — this is the most rounded theme. Shadows mix warm coral and cool blue in dual-tone stacking. Rubik type.

| Token           | Value                    | Notes                          |
| --------------- | ------------------------ | ------------------------------ |
| Primary-500     | `#dd7c55`                | Soft sunset coral              |
| Secondary-500   | `#597ba8`                | Twilight slate blue            |
| Accent-500      | `#f23d4e`                | Deep crimson                   |
| Surface-50      | `#fffcf8`                | Warm glowing sunrise           |
| Radius-sm / 2xl | 0.5rem / 2rem            | Largest rounding in the system |
| Shadow style    | Dual-tone (coral + blue) | Painterly layering             |
| Font            | Rubik                    | Friendly geometric             |

---

**Forest** — _The Forest Floor_
Emerald primary (#10b981) with warm gold secondary (#c9b210) and teal accent (#14b8a6). Warm olive surface tints. Organic radius (md=0.625rem). Shadows are natural emerald-tinted, low-contrast. The palette evokes forest light breaking through leaves — many greens, one highlight of gold.

| Token         | Value                  | Notes            |
| ------------- | ---------------------- | ---------------- |
| Primary-500   | `#10b981`              | Emerald          |
| Secondary-500 | `#c9b210`              | Warm gold        |
| Accent-500    | `#14b8a6`              | Teal             |
| Surface-50    | `#fafaf5`              | Warm olive-white |
| Radius-md     | 0.625rem               | Slightly organic |
| Shadow style  | Emerald-tinted ambient | Nature-softened  |
| Font          | Inter / Rubik          | Clean, readable  |

---

**Ghibli** — _The Animated Clearing_
Forest green (#4f8058), warm terracotta secondary (#c4713a), meadow-sky accent (#4f86a8). Warm cream surfaces (#fdfaf4) under a soft three-point painterly wash. The largest rounding in the system after Febin. Nunito carries body and UI; Fraunces carries headings — the serif is an accent, not the default. Shadows are the gentlest in the system. Dark mode is a real forest night: deep green-black surfaces (#10150f) with warm parchment text.

| Token         | Value                                           | Notes                                   |
| ------------- | ----------------------------------------------- | --------------------------------------- |
| Primary-500   | `#4f8058`                                       | Forest green, one family across 50→950  |
| Secondary-500 | `#c4713a`                                       | Warm terracotta                         |
| Accent-500    | `#4f86a8`                                       | Meadow sky                              |
| Surface-50    | `#fdfaf4`                                       | Warm cream                              |
| Surface-950   | `#171310` light / `#10150f` dark                | Dark mode supplies its own night ramp   |
| Radius-md     | 0.875rem (`--shape-radius` 1.125rem)            | Soft, hand-drawn feel                   |
| Shadow style  | Warm brown-tinted light, true dark in dark mode | Gentle depth                            |
| Body font     | Nunito                                          | Rounded, warm, readable at UI sizes     |
| Display font  | Fraunces (`--font-display`)                     | Theme-local token; h1–h4 and blockquote |

Three deliberate departures from the previous version:

- **Dark mode is now actually dark.** The old `.dark` block inverted the surface ramp (`--color-surface-950` → `#fdfbf7`), but `semantic.css` already inverts — it maps `--color-background` onto `surface-950` in dark mode. The two inversions cancelled and the page stayed cream. The dark ramp now runs the same direction as every other theme and supplies night colours at the dark end.
- **The ramps were spliced and are now continuous.** `primary-50…400` were stock Tailwind green (`#4ade80` at 400) bolted onto a muted forest green from 500 down, jumping hue and chroma mid-ramp. Because `semantic.css` reaches for `primary-400` as the dark-mode focus ring, this theme's ring was neon. Accent had the same splice (Tailwind sky over muted blue).
- **The serif moved to where a serif belongs.** Georgia headed the stack for _everything_, including 12px UI labels. Fraunces now handles display sizes and Nunito handles the rest — which is what the original "serif accent" comment described but the stack did not do.

---

**Ocean** — _The Deep Channel_
Deep indigo primary (#6366f1), cyan secondary (#06b6d4), violet accent (#8b5cf6). The standard cool-slate surface (same as Default). Blue-tinted gaussian shadows with glow support enabled. Smooth radius (md=0.5rem). Inter type. This is the most "professional SaaS" personality in the set — the one to reach for in data-heavy dashboards.

| Token         | Value                         | Notes                        |
| ------------- | ----------------------------- | ---------------------------- |
| Primary-500   | `#6366f1`                     | Deep indigo                  |
| Secondary-500 | `#06b6d4`                     | Cyan                         |
| Accent-500    | `#8b5cf6`                     | Violet                       |
| Surface-50    | `#f8fafc`                     | Cool slate (same as Default) |
| Radius-md     | 0.5rem                        | Standard smooth              |
| Shadow style  | Indigo-tinted gaussian + glow | Immersive depth              |
| Font          | Inter / Rubik                 | Clean geometric              |

---

**Rose** — _The Editorial Studio_
Rose pink primary (#f43f5e), slate purple secondary (#a855f7), warm fuchsia accent (#d946ef). Cool gray surface. Rose-tinted shadows. Smooth radius. The three palette colors are all high-saturation warm hues — this theme is deliberately bold and feminine without being decorative. Best for auth flows, landing pages, and editorial contexts.

| Token         | Value                       | Notes              |
| ------------- | --------------------------- | ------------------ |
| Primary-500   | `#f43f5e`                   | Rose pink          |
| Secondary-500 | `#a855f7`                   | Slate purple       |
| Accent-500    | `#d946ef`                   | Warm fuchsia       |
| Surface-50    | `#fafafa`                   | Cool neutral white |
| Radius-md     | 0.5rem                      | Standard smooth    |
| Shadow style  | Rose-tinted gaussian + glow | Saturated depth    |
| Font          | Inter / Rubik               | Clean geometric    |

---

**Sunset** — _The Golden Hour_
Amber/orange primary (#f97316), deep rose secondary (#f43f5e), golden yellow accent (#eab308). Warm stone surface (#fafaf9). Orange-tinted gaussian shadows. Rubik leads the font stack for a friendlier read. The energy here is kinetic — vibrant, high-contrast, unapologetically warm.

| Token         | Value                         | Notes            |
| ------------- | ----------------------------- | ---------------- |
| Primary-500   | `#f97316`                     | Amber orange     |
| Secondary-500 | `#f43f5e`                     | Deep rose        |
| Accent-500    | `#eab308`                     | Golden yellow    |
| Surface-50    | `#fafaf9`                     | Warm stone white |
| Radius-md     | 0.5rem                        | Standard smooth  |
| Shadow style  | Orange-tinted gaussian + glow | Warm, energetic  |
| Font          | Rubik / Inter                 | Friendly round   |

---

**Terminal** — _The Command Line_
Phosphor green (#10b981) on dark charcoal (#d4d4d8 surface-50). Amber cursor/highlight secondary (#f59e0b), cyan link accent (#06b6d4). Monospace font stack (SF Mono → Menlo → JetBrains Mono). Nearly zero rounding (sm=0.125rem, md=0.25rem). Minimal, near-flat shadows. Dark mode makes green more vivid (#22c55e) and surfaces go near-black (#060608). This is the theme for developer tooling contexts, settings pages, and code-adjacent screens.

| Token           | Value                               | Notes                       |
| --------------- | ----------------------------------- | --------------------------- |
| Primary-500     | `#10b981`                           | Phosphor green              |
| Secondary-500   | `#f59e0b`                           | Amber (cursor color)        |
| Accent-500      | `#06b6d4`                           | Cyan (link color)           |
| Surface-50      | `#d4d4d8`                           | Medium gray (inverted feel) |
| Radius-md       | 0.25rem                             | Near-zero rounding          |
| Shadow style    | Minimal black-tinted, flat          | Terminal chrome             |
| Font            | SF Mono → Menlo → JetBrains Mono    | Full mono stack             |
| Dark mode delta | Green `#22c55e`, surface near-black | Deepens authenticity        |

---

### Theme Named Rules

**The Consistent Architecture Rule.** All 10 themes override the same CSS custom properties. Components never query the theme name — they read tokens. A component that behaves correctly in Default will behave correctly in Terminal.

**The Zero-Radius Contract.** Blueprint and Brutalist set all radii to `0`. Components must not hardcode `rounded-*` class names with fixed values; they must derive rounding from `var(--radius-*)` tokens so shape responds correctly to theme.

There are **two** rounding scales, and anything that wants to change shape globally has to set both.

- `--radius-*` (app.css `@theme`) backs Tailwind's `rounded-sm`/`rounded-lg`/`rounded-full`. About 160 call sites across 64 components round themselves this way.
- `--shape-radius-*` (app.css `:root`) backs the user-facing shape preference, consumed via `rounded-[var(--shape-radius)]`, `.shaped-radius`, and the `[data-ui=…]` rules. About 50 call sites.

A **theme** that sets only `--radius-*` will not change the shape of a single card. A **shape preset** that sets only `--shape-radius-*` reaches barely a quarter of the app — which is why picking "sharp" used to leave most of the UI soft. Both the theme blocks and the `:root.shape-radius-*` presets now write both scales.

Precedence falls out of source order: themes are imported at the top of app.css and the presets are defined further down, at equal specificity, so a user's explicit shape choice overrides the theme's default. `shape-radius-medium` deliberately adds no class (see `state/shape.ts`), which is what lets each theme keep its own radii until the user actually picks something.

`--shape-border-width` follows the same pattern, with one limitation worth knowing: Tailwind's `border` utility emits a literal `1px`, not a token, so border width cannot be driven globally the way radius can. Only `.shaped-border` and the `[data-ui=…]` rules respond.

**The Typeface Handoff Rule.** Four themes switch the default typeface to a non-Inter stack: Blueprint (serif), Brutalist (Space Grotesk), Terminal (monospace), Ghibli (Nunito body / Fraunces display). Layouts must not assume Inter metrics — line-height, character width, and x-height differ meaningfully between stacks.

A theme font must be **loaded** as well as named. `index.html` carries the single Google Fonts request; a family that is not listed there falls silently through to the next entry in the stack, which is how Brutalist spent its life rendering in Courier New. Listing a family is cheap — the browser fetches a face only once a rule matches text with it, so theme-specific families cost nothing for users on other themes. Latin-only display faces (Fraunces) must name the Arabic faces after them so per-glyph fallback keeps RTL headings on Tajawal/Cairo instead of an arbitrary system font.

**The One Focus Indicator Rule.** Focus is drawn by exactly one thing: the global `*:focus-visible` outline in app.css, built on `--color-ring`, which re-points per theme _and_ per colour mode. Components must not set `focus-visible:outline-none` and substitute their own ring. `UiButton` used to, replacing it with `ring-<hue>-300` — a 300-weight tint that measured 1.66:1 against the page on Default and 2.08:1 on Brutalist, where WCAG 1.4.11 requires 3:1. A theme that needs a different ring overrides `--color-ring`; it must clear 3:1 against its own `--color-background` in both modes, and against any border colour the ring commonly sits beside. Two themes need a mode-specific override for this reason: Brutalist (yellow is 1.21:1 on its light page, so light mode uses magenta) and Terminal (whose "light" surface is a mid-grey `#d4d4d8`, so it rings at `primary-800` rather than the `primary-600` default).

Menu, listbox and calendar items are the documented exception: headless-UI roving focus is indicated by `data-highlighted` state, and `outline-none` on those is correct.

**The Dark-Ramp Direction Rule.** A theme's `.dark` block must keep the surface ramp pointing the same way as its light block — `50` light, `950` dark. `semantic.css` performs the inversion once for every theme by re-pointing `--color-background` at `surface-950`, `--color-foreground` at `surface-50`, and so on. A theme that also inverts its ramp cancels that out and ships a light "dark" mode. Supply night _colours_ at the dark end; never reverse the ordering.

---

## 3. Typography

**Body Font:** Inter (with Tajawal, Cairo as RTL Arabic fallbacks; Rubik as CJK/Unicode supplement)
**Display Font:** Inter — same family, heavy weight, tighter tracking
**Mono Font:** JetBrains Mono (code blocks, terminal theme body text)
**Theme Fonts:** Space Grotesk (Brutalist), Nunito + Fraunces (Ghibli), Rubik (Febin/Sunset) — all loaded from the single `index.html` font request

**Character:** Inter provides dense, precise information density without reading as clinical. At small sizes (0.75–0.875rem) it stays clean; at display sizes (2.25–3.75rem, 800 weight, −0.02em tracking) it acquires a commanding authority. The RTL fallback chain (Tajawal → Cairo) preserves the system's structural feel in Arabic.

### Hierarchy

- **Display** (800, clamp(2.25rem → 3.75rem), lh 1.1, ls −0.02em): Hero sections and primary marketing headings. Appears once per page maximum.
- **Headline** (700, clamp(1.5rem → 2.25rem), lh 1.2, ls −0.015em): Section titles, modal headings, major page titles.
- **Title** (600, 1.125rem, lh 1.4): Card titles, sidebar section labels, panel headers. The workhorse heading size.
- **Body** (400, 0.875rem, lh 1.6): All paragraph text, list items, description copy. Line width target: 60–72ch.
- **Label** (500, 0.75rem, lh 1.4, ls 0.01em): Buttons, form labels, badge text, navigation items, metadata. Medium weight gives authority at small size without going bold.

### Named Rules

**The Same-Family Rule.** Display, headline, title, body, and label are all Inter. No mix of display typefaces within a single theme variant. Theme-level typeface changes (Blueprint to serif, Terminal to mono) apply uniformly — the hierarchy stays intact, only the voice changes.

**The Mono Containment Rule.** JetBrains Mono is for code, terminal output, and the Terminal theme body. It must not appear in prose contexts in non-Terminal themes. Use `font-mono` as a targeted utility, not a default. Brutalist used to violate this by setting mono as `--font-sans`; it now uses Space Grotesk and leaves mono to `--font-mono`.

---

## 4. Elevation

This system is **flat-by-default**. Surfaces are flat at rest. Shadows appear only in response to state — hover, elevation, focus lift — or to separate a floating element (dropdown, dialog, tooltip) from its parent plane.

The neutral scale (`surface-50` through `surface-950`) carries structural hierarchy. A sidebar at `surface-100` reads as slightly elevated above a page at `surface-50` — no shadow required. A modal at `surface-50` on a dimmed backdrop communicates its elevation through the scrim, not through a large gaussian.

### Shadow Vocabulary

- **`--shadow-soft`** (`0 2px 10px -2px rgb(primary / 0.1)`): Subtle resting depth for inputs, inline cards at rest. Barely perceptible.
- **`--shadow-card`** (`0 1px 4px rgb(primary / 0.06)`): Card default state. Separates the card surface from the page without calling attention to it.
- **`--shadow-card-hover`** (`0 12px 36px -8px rgb(primary / 0.18)`): Card hover. Lifts the card toward the user — the tactile response that confirms interactivity.
- **`--shadow-elevated`** (`0 10px 30px -5px rgb(primary / 0.15)`): Dropdowns, popovers, command palettes. Structural float, not decorative.
- **`--shadow-glow-primary/secondary/accent`** (`0 0 24px rgb(primary / 0.3)`): Focus rings on icon buttons, selected state halos. Sparingly applied. Not available in Blueprint or Brutalist themes (intentionally disabled).

Shadow colors are tinted with the theme's primary hue at low opacity. Blueprint and Brutalist use hard flat offsets (2–6px, 0 blur) instead of gaussian shadows — matching their aesthetic contract.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, active focus) or to mark a floating layer (dropdown, dialog, sheet). Never apply `--shadow-card` to a surface that is not interactive or floating.

**The Tinted Shadow Rule.** In themes that use gaussian shadows, the shadow color matches the theme's primary hue at ≤18% opacity. Do not introduce neutral black shadows in tinted-shadow themes — it breaks the ambient warmth.

---

## 5. Components

### Buttons

_Tactile and confident_ — buttons give micro-scale lift on hover (`scale(1.02)`) and dip on press (`scale(0.97)`) with a cubic-bezier expo deceleration. The animation is disabled under `prefers-reduced-motion`.

- **Shape:** `rounded-lg` → `--radius-lg` (default 0.5rem; 0 in Blueprint/Brutalist; up to 1.125rem in Ghibli and 1rem in Febin)
- **Primary:** `bg-primary-500 text-white` · hover `bg-primary-600` · active `bg-primary-700` · focus ring `ring-primary-300`
- **Secondary:** `bg-secondary-500 text-white` · hover `bg-secondary-600` · active `bg-secondary-700`
- **Accent:** `bg-accent-500 text-white` · hover `bg-accent-600`
- **Ghost:** `bg-transparent text-surface-700` · hover `bg-surface-100` · dark: `text-surface-200 hover:bg-surface-800`
- **Destructive:** `bg-danger-500 text-white` · hover `bg-danger-600`
- **Sizes:** xs (`px-2 py-1 text-xs`), sm (`px-3 py-1.5 text-sm`), **md** (`px-4 py-2 text-sm` — default), lg (`px-5 py-2.5 text-base`), xl (`px-6 py-3 text-lg`)
- **Icon-only:** All sizes enforce min 44×44px touch target (`min-h-[44px] min-w-[44px]`) to meet WCAG 2.5.5 AAA
- **Sub-44px text buttons:** xs and sm expand hit area via invisible `::after` pseudo-element. Visual density is preserved; accessibility is not compromised.
- **Loading state:** Disables hover scale; shows spinner slot. Full-width (`block`) buttons also skip scale transforms.

### Cards

- **Surface:** `bg-surface-50` (light) / `bg-surface-800` (dark)
- **Border:** `border border-surface-200` (light) / `border-surface-700` (dark) — 1px, no radius override needed
- **Shape:** `rounded-lg` → `--radius-lg`
- **Padding:** `p-6` (1.5rem) default
- **Hover (interactive cards):** `shadow-card-hover` + `translate-y-[-1px]` — a 1px lift confirms interactivity without exaggeration
- **No border-left accent stripes.** Side-stripe decoration is an anti-pattern in this system; use a `border-t border-primary-500` or a tinted `bg-primary-50` header region instead.

### Inputs

- **Height:** `h-10` (2.5rem)
- **Shape:** `rounded-md` → `--radius-md`
- **Border:** `border border-surface-200` · focus `border-primary-500 ring-2 ring-primary-300/30`
- **Label position:** Above the field, not floating. Labels are always visible — no placeholder-as-label pattern.
- **Error state:** `border-danger-500` + `text-danger-600` helper text below
- **Padding:** `px-3 py-2`
- **Background:** `bg-surface-50` (light) / `bg-surface-800` (dark)

### Navigation

- **AppHeader:** Sticky, `h-16`, `bg-surface-50/80 backdrop-blur-md` for translucency. Brand logo left, actions right.
- **AppSidebar:** Collapsible aside. Width `w-64` expanded. RTL-aware: `ltr:-translate-x-full rtl:translate-x-full` when closed.
- **Active state:** `bg-primary-50 text-primary-700` (light) / `bg-primary-950/40 text-primary-300` (dark) + `aria-current="page"` on the anchor.
- **Icon-only nav buttons:** Must carry `aria-label` — never rely on `title` or tooltip alone.

### Badges / Chips

- **Shape:** `rounded-full` for status badges, `rounded-md` for filter chips
- **Semantic variants:** green (success), yellow (warning), red (error), blue (info), gray (neutral)
- **Size:** `px-2 py-0.5 text-xs font-medium`
- **No icon + text color with background color from a different semantic family.** Green text on green bg; red text on red bg.

### Dialogs / Modals

- **Backdrop:** `bg-surface-950/60 backdrop-blur-sm`
- **Panel:** `bg-surface-50` (light) · `rounded-xl` shape · `shadow-elevated` · `max-w-lg w-full`
- **Dark panel:** `bg-surface-800`
- **Close button:** Always present; icon-only with `aria-label="Close"`

### Data Tables

- **Row hover:** `bg-surface-100` (light) / `bg-surface-800/50` (dark)
- **Border:** Row separator `border-b border-surface-200`
- **Header:** `bg-surface-100 text-surface-500 text-xs font-medium uppercase tracking-wide`
- **Sticky header:** `sticky top-0 z-10`

---

## 6. Do's and Don'ts

### Do

- **Use `--radius-*` tokens for all shape decisions.** Never hardcode `rounded-lg` or `rounded-full` with intent to be theme-agnostic — use the semantic token that maps to it so Blueprint and Brutalist (radius=0) behave correctly.
- **Use `--color-primary-*` / `--color-surface-*` tokens for all color decisions.** Components that reference tokens work correctly in all 10 themes without modification.
- **Pair each interactive element with a visible, non-color-only focus indicator** (`ring-2 ring-primary-300 ring-offset-2`). This applies to all themes including high-contrast Terminal and Brutalist.
- **Apply `aria-current="page"` to active navigation links** in addition to any visual active class. CSS alone is not sufficient for WCAG 4.1.2.
- **Scale typography with `clamp()`** at display and headline sizes. Fixed rem values only for body, label, and title.
- **Tint shadows with the theme's primary hue** (≤18% opacity). In themes that have configured tinted shadows, neutral-black shadows will feel foreign.
- **Use logical CSS properties** (`inset-inline-start`, `border-inline-end`, `margin-inline`) for all directional styles. RTL support is built-in; hardcoded `left`/`right` properties break it.
- **Bridge chart/data-viz colors to theme tokens** via computed CSS properties. Never hardcode hex colors in ECharts or similar configs — they will not update when the theme changes.

### Don't

- **Don't use gradient text** (`background-clip: text` + `linear-gradient`). This is an absolute ban in Vuestrata. It creates clipping artifacts in dark mode, fails high-contrast themes, and carries connotations of 2021 SaaS templates.
- **Don't use `border-left` or `border-left-4` accent stripes** on cards, notifications, or list items. They break RTL layout (`border-inline-start` is the RTL-safe alternative) and are a visual anti-pattern in this design language.
- **Don't use identical card grids** (4+ cards with the same structure: tinted icon circle + heading + body in 2-col). Identical repetition without visual anchoring removes hierarchy. Differentiate by size, emphasis, or use a list/table for truly equivalent data.
- **Don't place animated blur blobs** (large `blur-[100px+]` elements under continuous float animations) without a `@media (prefers-reduced-motion: reduce)` guard. They are GPU-expensive and disorienting for vestibular users.
- **Don't use `title` attributes as the sole accessible name** for icon-only controls. Use `aria-label` directly on the element.
- **Don't hardcode dark-mode backgrounds with hex values.** Use theme tokens or `color-mix()` against token references so dark mode respects the active theme.
- **Don't invent new color roles outside the token vocabulary** (`primary`, `secondary`, `accent`, `surface`, `danger`). A one-off purple for a single component breaks the theming contract — map it to the nearest semantic role or use the accent scale.
- **Don't skip `resetRuntimeState()` in unit tests** that touch stores or global state. The test setup already calls it in `beforeEach`; adding per-file `clearXxx()` helpers creates state leak inconsistencies.

---

<!-- SIDECAR BEGIN — tokens not supported by Stitch's 8-prop component spec -->

## Appendix: Sidecar Tokens

The following properties are real but fall outside the Stitch component 8-prop set. They are documented here for agent reference.

### Focus Rings

```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-primary-300/30      /* light mode */
focus-visible:ring-offset-2
dark:focus-visible:ring-offset-surface-900
```

### Motion / Transitions

```css
/* Base transition — expo deceleration */
transition: all 150ms cubic-bezier(0.16, 1, 0.3, 1);

/* Button scale micro-interaction */
hover:scale-[1.02]
active:scale-[0.97]

/* Motion-safe guard on all transform transitions */
motion-reduce:transition-none
motion-reduce:hover:scale-100
motion-reduce:active:scale-100
```

### Available Named Animations

- `animate-fade-in` — opacity 0→1, 200ms
- `animate-slide-up` — translateY(8px)→0, 200ms
- `animate-slide-down` — inverse
- `animate-scale-in` — scale(0.95)→1, 150ms
- `animate-shake` — input error feedback
- `animate-shimmer` — skeleton loading
- `animate-press` — scale press feedback
- `animate-float` — continuous gentle rise/fall (guard with `prefers-reduced-motion`)
- `animate-pulse-glow` — pulsing shadow glow
- `animate-gradient-shift` — animated gradient background position

### Shadow Glows (theme-dependent)

Available in: Ocean, Forest, Sunset, Rose, Terminal (dark only), Febin  
Disabled in: Blueprint (`none`), Brutalist (no variable set)

```
--shadow-glow-primary:   0 0 24px rgb(primary-500 / 0.3)
--shadow-glow-secondary: 0 0 24px rgb(secondary-500 / 0.3)
--shadow-glow-accent:    0 0 24px rgb(accent-500 / 0.3)
```

### Blueprint-Exclusive Token

```css
--blueprint-grid-major: rgb(160 140 90 / 0.3) /* major grid lines */
  --blueprint-grid-minor: rgb(160 140 90 / 0.12) /* minor grid lines */;
```

These are applied via SVG `background-image` on `:root.theme-blueprint`. Do not replicate this pattern in other themes.

<!-- SIDECAR END -->
