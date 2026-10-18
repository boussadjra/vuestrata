---
name: Vuestrata
description: One component vocabulary, twelve design personalities, and a navy, copper and paper default identity.
colors:
  midnight: '#031b38'
  midnight-hover: '#0a2a50'
  copper: '#cf4c18'
  copper-text: '#b23d15'
  copper-inverse-text: '#e78d61'
  paper: '#f3efe3'
  sheet: '#faf7ef'
  stone: '#8b744e'
  rule: '#d8d1c2'
  muted-ink: '#55616b'
  night: '#021326'
  danger-signal: '#ef4444'
typography:
  display:
    fontFamily: "'Vuestrata Newsreader', 'Vuestrata Naskh', Georgia, serif"
    fontSize: 'clamp(2.75rem, 6vw, 6rem)'
    fontWeight: '500'
    lineHeight: '1.04'
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "'Vuestrata Newsreader', 'Vuestrata Naskh', Georgia, serif"
    fontSize: '2.25rem'
    fontWeight: '500'
    lineHeight: '1.15'
  title:
    fontFamily: "'Vuestrata Jakarta', 'Vuestrata Tajawal', sans-serif"
    fontSize: '1.125rem'
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: "'Vuestrata Jakarta', 'Vuestrata Tajawal', sans-serif"
    fontSize: '1rem'
    fontWeight: '400'
    lineHeight: '1.65'
  label:
    fontFamily: "'Vuestrata Jakarta', 'Vuestrata Tajawal', sans-serif"
    fontSize: '0.875rem'
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: '0.1875rem'
  md: '0.375rem'
  lg: '0.5rem'
  xl: '0.75rem'
  2xl: '1rem'
  full: '9999px'
components:
  button-primary:
    backgroundColor: '{colors.midnight}'
    textColor: '{colors.paper}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0.625rem 1rem'
  card:
    backgroundColor: '{colors.sheet}'
    textColor: '{colors.midnight}'
    rounded: '{rounded.lg}'
    padding: '1.5rem'
  input:
    backgroundColor: '{colors.sheet}'
    textColor: '{colors.midnight}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
---

# Design System: Vuestrata

## 1. Overview

**Creative North Star: "The Architect's Workbench"**

The default identity combines midnight navy, fired copper and warm paper. A developer exploring the foundation in daylight sees an expressive serif headline and a working interface beneath it; an operator sees familiar sans-serif controls and readable data. Home can use large inverse navy surfaces and a paced visual story. Authenticated screens keep the colour quieter and the information easy to scan.

The identity lives in the seeded `src/modules/app/styles/brand.css` seam. Managed UI, semantic infrastructure and theme files remain unchanged. Default has no `theme-*` class; every identity selector is scoped to that condition. The other eleven personalities keep their own type, colour and geometry.

### Brand mark

The Vuestrata symbol is three parallel copper parallelograms rising to the right
on a midnight navy field. Keep the bars' slope, weight, spacing and relative
lengths consistent between the component and static SVG exports. The geometry
is vector artwork, without gradients, shadows, outlines or font dependencies.

The symbol uses fixed navy `#031b38` and copper `#cf4c18`. Its navy field keeps
the copper mark legible across all selectable themes; it is not recoloured by
the active primary or accent ramp. A full lockup may pair the symbol with the
Vuestrata wordmark in the active foreground colour. The standalone badge is
the favicon and compact-navigation form. Preserve clear space around the mark
and retain the full badge when reducing it to browser-tab size.

The mark always rises to the right, including in Arabic. Mirror surrounding
navigation and spacing for RTL, never the logo artwork. Give meaningful SVGs
an accessible name; `Logo.vue` retains its title, full/icon variant and custom
class API. Projects own that seeded component and may replace it with their
own product identity without changing managed layouts.

`public/favicon.svg` is the browser icon. `public/site.webmanifest` references
it with a relative path so installations under a URL prefix keep working.
Static exports and application-shell instances should use the same three-bar
geometry. Framework logos and historical personal images are not alternate
Vuestrata marks.

The system rejects what PRODUCT.md calls the anti-references by name: Bootstrap admin dashboards with their accordion of padded boxes, Vercel-style marketing templates that prioritize whitespace over density, cluttered Material Design with competing elevation and ripple at every tier, and the generic SaaS dashboard aesthetic of blue gradients and star-rating widgets. Vuestrata is for developers who want production-grade structure, not a style show.

Twelve named themes extend this foundation without changing the architecture. Each theme overrides the same CSS custom-property vocabulary — colour ramps, radii, elevation, typeface — so the layout and component structure remain constant. A screen that works in Default works in Terminal. The themes are not skins; they are first-class design personalities, each with its own aesthetic rationale.

### What a theme may change, and what it may not

The marketing story and the engineering contract are the same sentence: _same
application architecture and components, different visual personalities._ That
only holds because the split below is enforced rather than assumed.

**Structural invariants — identical in all 12 themes:**

- Component contracts. Every `Ui*` wrapper has the same props, slots and events
  regardless of theme, and no component branches on the theme name.
- The semantic token vocabulary. Themes redefine what `--color-primary-500` or
  `--radius-md` resolves to; they never invent a new role. The five colour roles
  are `primary`, `secondary`, `accent`, `surface`, `danger`.
- Layout and behaviour. Page structure, navigation, focus order, and
  interaction semantics do not vary by theme.
- Accessibility expectations. Contrast targets, the single `*:focus-visible`
  indicator, `prefers-reduced-motion` handling, and RTL correctness apply to
  every theme in both colour modes.
- Iconography. Icons come from the icon provider (`config/icon.config.ts`),
  which is selected independently. **A theme does not change the icon set.**
- Density and spacing. No theme redefines the spacing scale.
- Motion. Durations and easings are global; no theme overrides them.

**Theme-level variables — may differ, and do:**

| Dimension                                                   | Implemented by                                                          | Coverage                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Colour ramps (primary/secondary/accent/surface, both modes) | `--color-*`                                                             | all 12                                                     |
| Border radius                                               | `--radius-*`, and `--shape-radius-*` where the theme sets both          | all 12                                                     |
| Elevation                                                   | `--shadow-soft/card/card-hover/elevated` — gaussian, or hard offset ink | all 12                                                     |
| Glow tokens                                                 | `--shadow-glow-*`                                                       | tinted in 8; set to `none` in Analog, Blueprint, Brutalist |
| Body typeface                                               | `--font-sans`                                                           | 8 of 12 depart from Inter                                  |
| Display / mono typeface                                     | `--font-display`, `--font-mono`                                         | Analog, Ghibli (display); Analog (mono)                    |
| Border weight                                               | `--shape-border-width`                                                  | Analog, Brutalist                                          |
| Chart palette                                               | `--color-chart-1…8`                                                     | Analog, Blueprint, Harbour, Pro                            |
| Theme-local drawing primitives                              | e.g. `--blueprint-grid-*`, `--analog-grain`                             | Blueprint, Analog                                          |

Not every theme changes every dimension, and that is the point: a theme spends
variation where its personality needs it and inherits the rest.

**Key Characteristics:**

- Single interactive accent per theme; rarity is the point
- Flat surfaces at rest — depth responds to state, not decoration
- Dense, information-first layouts with clear visual hierarchy
- RTL-native: logical CSS properties throughout (`inset-inline`, `border-inline`, `ltr:`/`rtl:` utilities)
- WCAG 2.1 AAA contrast target across all themes and modes
- All 12 themes support both light and dark mode via `html.dark` class
- Motion respects `prefers-reduced-motion` at the component level

---

## 2. Colors: Midnight, Copper and Paper

The user's three anchors are exact: **midnight `#031b38`**, **copper `#cf4c18`**, and **paper `#f3efe3`**. The ramps add the shades needed for controls, states and both colour modes.

### Roles

- **Midnight:** structural ink, primary controls, and inverse feature surfaces. Navy on paper measures 15.00:1.
- **Copper:** large editorial accents, prominent marks and chart series. Exact copper on paper measures 3.89:1, so it is reserved for large text and non-text marks. Small copper text uses `accent-600` (`#b23d15`), measuring 5.11:1 on paper and 4.64:1 on the muted surface.
- **Paper:** the page ground. Cards use a slightly lighter sheet (`#faf7ef`), floating surfaces use `#fdfaf2`, and muted areas use `#eae4d6`.
- **Warm stone:** supporting information and secondary data, with the same hierarchy as the navy ramp.
- **Status colours:** the shared success, warning, error and info ramps retain their meanings.

### Light and dark

Light mode is warm paper with navy ink and restrained copper. Dark mode uses a deep navy ground (`#021326`), a lifted navy card (`#0b2540`), paper text, and brighter copper links. The surface ramp always remains `50` light to `950` dark; semantic aliases perform the mode change.

The primary solid reverses in dark mode: paper fill and navy label. Light-mode focus uses accessible dark copper; dark-mode focus uses `accent-400`.

### Feature surfaces

Owned features may use the optional `--color-spotlight*` aliases: midnight ground, paper text, light navy muted text, and copper marks. Small copper text on the inverse ground uses `--color-spotlight-link` (`#e78d61`, 6.88:1). Components must supply a semantic or ramp fallback for every alias so other themes stay complete.

### Scope and preferences

Only the default identity changes. Brand rules never target a named theme. The default radius rules exclude an explicit `shape-radius-*` class, so a user's sharp, small or large preference keeps its effect. Shared status colours, keyboard focus handling, reduced-motion behaviour and RTL layout remain part of the existing component contract.

### Page backgrounds

Keep the default page ground plain: warm paper in light mode and deep navy in
dark mode. Use semantic surface colours and borders to separate sections.
Geological bands and decorative background patterns are not part of this identity.

---

### Theme Variants

The theming engine works by overriding the same `--color-*`, `--radius-*`, `--shadow-*` and `--font-sans` custom properties on `:root.<theme-class>`; individual themes additionally set `--shape-*`, `--font-display`/`--font-mono`, `--color-chart-*`, or their own theme-local primitives. Apply a theme with `class="theme-<name>"` on `<html>`. All 12 themes support `html.dark`.

#### Character Cards

| Theme         | Aesthetic                               | Design Mood                                  |
| ------------- | --------------------------------------- | -------------------------------------------- |
| **Default**   | Midnight, copper and paper              | Confident serif headings, precise working UI |
| **Analog**    | Burnt coral on warm paper               | Editorial notebook, ink, data sketch         |
| **Blueprint** | Plotter azure + verdigris + Corten      | Technical, gridded, drawing-set precision    |
| **Brutalist** | True B&W, electric yellow + magenta     | Uncompromising, raw, zero decoration         |
| **Forest**    | Emerald + warm gold on olive            | Grounded, natural, earthy abundance          |
| **Ghibli**    | Forest green + terracotta on warm cream | Whimsical, hand-crafted, serene              |
| **Harbour**   | Burnt orange + cobalt on warm cream     | Painterly, complementary, autumn coast       |
| **Ocean**     | Deep indigo + cyan on cool slate        | Immersive, professional, coastal depth       |
| **Pro**       | Operator blue on cool paper             | Daylight SaaS console, restrained, quiet     |
| **Rose**      | Rose pink + slate purple                | Sophisticated, modern, editorial             |
| **Sunset**    | Amber/orange + deep rose on warm stone  | Energetic, warm, high-vibration              |
| **Terminal**  | Phosphor green on dark charcoal         | Developer-native, monospace, austere         |

#### Full Token Table

| Theme     | Primary-500 | Secondary-500 | Accent-500 | Surface-50 | Radius-md | Body Font         |
| --------- | ----------- | ------------- | ---------- | ---------- | --------- | ----------------- |
| Default   | `#315f8e`   | `#8b744e`     | `#cf4c18`  | `#f3efe3`  | 0.375rem  | Plus Jakarta Sans |
| Analog    | `#e85d3f`   | `#3a7a73`     | `#d4b63a`  | `#f3efe6`  | 0.25rem   | IBM Plex Sans     |
| Blueprint | `#3b73ed`   | `#1f9187`     | `#cd5a2f`  | `#f7f9fc`  | 0         | IBM Plex Sans     |
| Brutalist | `#303030`   | `#d9c200`     | `#ff1a75`  | `#fafafa`  | 0         | Space Grotesk     |
| Forest    | `#10b981`   | `#c9b210`     | `#14b8a6`  | `#fafaf5`  | 0.625rem  | Inter             |
| Ghibli    | `#4f8058`   | `#c4713a`     | `#4f86a8`  | `#fdfaf4`  | 0.875rem  | Nunito / Fraunces |
| Harbour   | `#e2661f`   | `#4a60d2`     | `#c4497f`  | `#fdf7ef`  | 0.75rem   | Rubik             |
| Ocean     | `#6366f1`   | `#06b6d4`     | `#8b5cf6`  | `#f8fafc`  | 0.5rem    | Inter             |
| Pro       | `#2d61f0`   | `#6a7588`     | `#2a9d93`  | `#f5f6f9`  | 0.5rem    | Plus Jakarta Sans |
| Rose      | `#f43f5e`   | `#a855f7`     | `#d946ef`  | `#fafafa`  | 0.5rem    | Inter             |
| Sunset    | `#f97316`   | `#f43f5e`     | `#eab308`  | `#fafaf9`  | 0.5rem    | Rubik             |
| Terminal  | `#10b981`   | `#f59e0b`     | `#06b6d4`  | `#d4d4d8`  | 0.25rem   | SF Mono           |

#### Per-Theme Deep Dive

---

**Default**: _Midnight, Copper and Paper_

Newsreader headings supply a contemporary serif voice, with Noto Naskh Arabic for Arabic display text. Plus Jakarta Sans and Tajawal keep controls and data precise. Warm paper, modest corners and subtle navy-tinted elevation give the working screens a clear hierarchy. The home story can spend more navy and copper without turning everyday controls into decoration.

| Token                  | Value                          | Notes                                |
| ---------------------- | ------------------------------ | ------------------------------------ |
| Primary-50 through 950 | `#eef3f8` to `#021226`         | Navy structural ramp                 |
| Primary solid, light   | `#031b38`                      | Exact midnight, paper label          |
| Accent-500             | `#cf4c18`                      | Exact copper, large marks            |
| Accent-600             | `#b23d15`                      | Accessible small copper text         |
| Surface-50             | `#f3efe3`                      | Exact paper                          |
| Radius-md              | 0.375rem                       | Explicit shape preferences still win |
| Body                   | Plus Jakarta Sans / Tajawal    | Locally bundled sans-serif           |
| Display                | Newsreader / Noto Naskh Arabic | Locally bundled, heading-only        |

---

**Analog** — _The Analyst's Notebook_
Warm paper (`#f3efe6`) with a slightly lighter sheet for cards (`#faf7f0`). Burnt coral is the pen, muted teal the second colour, gold a highlighter used once in a legend. IBM Plex Sans for body, IBM Plex Mono for labels and figures, Newsreader for headings. Grain, a dotted grid, 2–6px radii, and a `3px 3px 0` ink offset instead of gaussian shadow. No glass, no wash, no button gradients.

| Token         | Value                                          | Notes                                            |
| ------------- | ---------------------------------------------- | ------------------------------------------------ |
| Primary-500   | `#e85d3f`                                      | Specified coral; solid is 700 (`#a33c28`)        |
| Secondary-600 | `#2f6f68`                                      | Specified teal, the second pen                   |
| Accent-400    | `#e7c95a`                                      | Gold highlighter; charts, never a filled control |
| Surface-50    | `#f3efe6` / card `#faf7f0`                     | Warm paper; ink text `#25231f`                   |
| Radius-md     | 0.25rem (`--shape-radius` 0.25rem)             | 2–6px on both scales                             |
| Shadow style  | `3px 3px 0 rgb(37 35 31 / 0.12)`, RTL-mirrored | Offset ink, no blur                              |
| Body font     | IBM Plex Sans → Tajawal/Cairo                  | Technical grotesque                              |
| Display font  | Newsreader (`--font-display`)                  | Editorial headings                               |
| Mono          | IBM Plex Mono                                  | Labels, badges, figures                          |
| Charts        | Coral / teal / gold / ink                      | Gold once; dashed guides come from chart tokens  |

---

**Blueprint** — _The Drawing Set_
A contemporary architectural drawing. Light mode is the plotted sheet: azure line work on cool white stock. Dark mode is the reprographic original — the cyanotype, pale blue on Prussian blue. The supporting palette is a material board rather than an ink collection: verdigris for oxidised copper and zinc, Corten terracotta for weathering steel. All radii are zero on both scales. Shadows are hard flat offsets, mirrored in RTL. Four patterns are lifted from real drawing conventions (below).

| Token         | Value                                            | Notes                                        |
| ------------- | ------------------------------------------------ | -------------------------------------------- |
| Primary-500   | `#3b73ed`                                        | Plotter azure, one family across 50→950      |
| Secondary-500 | `#1f9187`                                        | Verdigris — patinated copper                 |
| Accent-500    | `#cd5a2f`                                        | Corten / terracotta, hue ≈ 16°               |
| Surface-50    | `#f7f9fc` light / `#eaf2fb` dark ramp            | Drawing stock; dark ramp is its own          |
| Surface-950   | `#0d141f` light / `#08131f` dark                 | Prussian blue is the dark page               |
| Radius        | 0 everywhere, incl. the `--shape-radius-*` scale | No rounding — drafting precision             |
| Shadow style  | Hard flat offset (1–4px, 0 blur), RTL-mirrored   | Sheets stacked on a board                    |
| Font          | IBM Plex Sans → Inter → Tajawal/Cairo            | Technical grotesque, drawn on an eng. grid   |
| Charts        | Own 8-slot material board                        | Semantic default put three blues in a legend |

The four patterns, each a real drawing convention:

| Pattern               | Where                                  | Convention it comes from                    |
| --------------------- | -------------------------------------- | ------------------------------------------- |
| Modular sheet grid    | `:root` — 12px snap + 96px module      | The drawing sheet itself                    |
| Registration marks    | `.card::before` — four corner L-marks  | Crop/registration marks on a plotted sheet  |
| Drawing frame         | `.card::after` — hairline inset 6px    | The border set in from the paper edge       |
| Section hatch (poché) | Header bottom band, `thead`            | 45° hatch marking cut material in a section |
| Construction lines    | Inputs: dashed at rest, solid on focus | Orthographic hidden/setting-out lines       |

Four deliberate departures from the previous version:

- **It is blue now.** The theme called "Blueprint" ran sepia ink on yellowed parchment — a _vintage paper_ theme. Blue was demoted to `secondary`, so the one colour the name promises never reached a primary button, a link, a focus ring or the first chart series.
- **The motifs are architectural, not papercraft.** A torn-paper `clip-path` ribbon across the top of every card is a scrapbook device. The five conventions above are all taken from drawing sets.
- **Bookman Old Style is a 1936 bookface.** Working drawings are lettered in a technical grotesque — DIN, Univers and descendants. All-caps lettering is kept for buttons and dropped for body copy, because drawing _notes_ are sentence case.
- **Rounding was only half-zeroed.** `--radius-*` was `0` but `--shape-radius-*` was not, so the theme fought its own softness back with `border-radius: 0 !important` on each element in turn. See the Zero-Radius Contract.

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
Forest green (#4f8058), warm terracotta secondary (#c4713a), meadow-sky accent (#4f86a8). Warm cream surfaces (#fdfaf4) under a soft three-point painterly wash. The largest rounding in the system after Harbour. Nunito carries body and UI; Fraunces carries headings — the serif is an accent, not the default. Shadows are the gentlest in the system. Dark mode is a real forest night: deep green-black surfaces (#10150f) with warm parchment text.

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

**Harbour** — _The Autumn Coast_
Painted from a reference illustration: cobalt cottages on an orange headland, a cold periwinkle sea behind them, a cream sky with the sun just above the horizon, a figure in a plum coat in the foreground. The whole image is one complementary pair — burnt orange against cobalt — held together by warm cream, and that is the theme. Primary is the headland (the largest field of colour), secondary the cottages (the subject), accent the coat. The page wash is the composition in four gradient layers: sun, sea band, headland, brick-red brush. Largest rounding in the system, on both scales. Rubik type.

| Token           | Value                                    | Notes                                           |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| Primary-500     | `#e2661f`                                | Burnt orange, hue ≈ 22° — deeper than Sunset    |
| Secondary-500   | `#4a60d2`                                | Cobalt, the one saturated cool in the picture   |
| Accent-500      | `#c4497f`                                | Plum — unique in the set, far from every status |
| Surface-50      | `#fdf7ef` light / `#f6f1ea` dark ramp    | Sky cream; cold shadow at the dark end          |
| Radius-sm / 2xl | 0.5rem / 2rem (`--shape-radius` 1.25rem) | Largest rounding in the system                  |
| Shadow style    | Dual-tone (headland warm + sea cool)     | Painterly layering                              |
| Font            | Rubik (carries Arabic itself)            | Friendly geometric                              |
| Charts          | Own 8-slot palette read off the painting | Warm/cool alternate slot to slot                |

Six deliberate departures from the previous version:

- **It was called "Febin".** A name that described nothing and identified nobody, which is the one job a theme name has in a picker of ten. `plugins/appearance.ts` carries a `THEME_ALIASES` map so a browser still holding the old value in `vuestrata-theme` resolves to Harbour and gets the new name written back, rather than silently reverting to Default.
- **The palette follows the picture.** The old accent was a crimson one hue step off `--color-danger-*`, so an accent chip and a destructive button were the same colour.
- **Rubik was never loaded.** `--font-sans` had named it since the theme was written, but it was absent from `index.html`, so Harbour — and Sunset, which also names it — silently rendered in the platform default sans.
- **It was not actually the most rounded theme.** `--radius-*` was large but `--shape-radius-*` was not, and cards, buttons and inputs round from the latter.
- **The button rules matched nothing.** They keyed off `button.bg-primary-700`, a utility no component emits. They now use the `data-ui` / `data-variant` attributes the UI kit renders.
- **The glass surfaces hardcoded `rgba(255, 250, 243, …)`** — literal copies of two ramp steps, which detach the moment the ramp moves. They are `color-mix` on the tokens now, at 90% rather than 82%: a translucent card composites against whatever the wash is doing behind it, so the effective contrast of body copy is not knowable from the declared colours.

---

**Ocean** — _The Deep Channel_
Deep indigo primary (#6366f1), cyan secondary (#06b6d4), violet accent (#8b5cf6). The standard cool-slate surface. Blue-tinted gaussian shadows with glow support enabled. Smooth radius (md=0.5rem). Inter type. Saturated cool sibling of Pro — immersive, not the quiet operator console.

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

**Pro** — _The Operator Console_
Daylight SaaS dashboard. Electric operator blue on cool blue-tinted paper. One accent does the interactive work; steel, hairline borders, and Plus Jakarta Sans do the rest. Modest rounding on both radius scales. Almost-flat gaussian shadows tinted with the blue. Dark mode is a navy night at the dark end of the same ramp — semantic.css performs the flip. No glass, no page wash, no button gradients.

| Token         | Value                                            | Notes                                               |
| ------------- | ------------------------------------------------ | --------------------------------------------------- |
| Primary-500   | `#2d61f0`                                        | Operator blue, hue ≈ 225°; solid is 600 (`#1448e6`) |
| Secondary-500 | `#6a7588`                                        | Cool steel — chrome, not a second accent            |
| Accent-500    | `#2a9d93`                                        | Muted teal for charts; far from danger/warning      |
| Surface-50    | `#f5f6f9` light / `#f5f6f9` dark ramp            | Cool paper; navy `#0b0e16` at 950                   |
| Radius-md     | 0.5rem (`--shape-radius` 0.75rem)                | Modest dashboard rounding on both scales            |
| Shadow style  | Blue-tinted gaussian, ≤12% opacity               | Almost-flat                                         |
| Font          | Plus Jakarta Sans → Tajawal/Cairo                | Latin face; RTL falls through                       |
| Charts        | Own 8-slot palette (blue / teal / amber / steel) | Adjacent slots differ in hue and lightness          |

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

**The Consistent Architecture Rule.** All 12 themes override the same CSS custom properties. Components never query the theme name — they read tokens. A component that behaves correctly in Default will behave correctly in Terminal.

**The Zero-Radius Contract.** Blueprint and Brutalist set all radii to `0`. Components must not hardcode `rounded-*` class names with fixed values; they must derive rounding from `var(--radius-*)` tokens so shape responds correctly to theme.

There are **two** rounding scales, and anything that wants to change shape globally has to set both.

- `--radius-*` (app.css `@theme`) backs Tailwind's `rounded-sm`/`rounded-lg`/`rounded-full`. About 160 call sites across 64 components round themselves this way.
- `--shape-radius-*` (app.css `:root`) backs the user-facing shape preference, consumed via `rounded-[var(--shape-radius)]`, `.shaped-radius`, and the `[data-ui=…]` rules. About 50 call sites.

A **theme** that sets only `--radius-*` will not change the shape of a single card. A **shape preset** that sets only `--shape-radius-*` reaches barely a quarter of the app — which is why picking "sharp" used to leave most of the UI soft. Both the theme blocks and the `:root.shape-radius-*` presets now write both scales.

Precedence falls out of source order: themes are imported at the top of app.css and the presets are defined further down, at equal specificity, so a user's explicit shape choice overrides the theme's default. `shape-radius-medium` deliberately adds no class (see `state/shape.ts`), which is what lets each theme keep its own radii until the user actually picks something.

`--shape-border-width` follows the same pattern, with one limitation worth knowing: Tailwind's `border` utility emits a literal `1px`, not a token, so border width cannot be driven globally the way radius can. Only `.shaped-border` and the `[data-ui=…]` rules respond.

**The Typeface Handoff Rule.** Eight named themes provide their own typeface stacks: Blueprint (IBM Plex Sans), Analog (IBM Plex Sans body / Newsreader display / IBM Plex Mono labels), Brutalist (Space Grotesk), Terminal (monospace), Ghibli (Nunito body / Fraunces display), Harbour and Sunset (Rubik), Pro (Plus Jakarta Sans). Layouts must not assume Inter metrics — line-height, character width, and x-height differ meaningfully between stacks.

A theme font must be **loaded** as well as named. The default identity loads local WOFF2 assets; `index.html` carries the existing named-theme Google Fonts request; a family that is not listed there falls silently through to the next entry in the stack, which is how Brutalist spent its life rendering in Courier New and Harbour/Sunset spent theirs in the platform default sans. Listing a family is cheap — the browser fetches a face only once a rule matches text with it, so theme-specific families cost nothing for users on other themes. Latin-only display faces (Fraunces) must name the Arabic faces after them so per-glyph fallback keeps RTL headings on Tajawal/Cairo instead of an arbitrary system font.

**The One Focus Indicator Rule.** Focus is drawn by exactly one thing: the global `*:focus-visible` outline in app.css, built on `--color-ring`, which re-points per theme _and_ per colour mode. Components must not set `focus-visible:outline-none` and substitute their own ring. `UiButton` used to, replacing it with `ring-<hue>-300` — a 300-weight tint that measured 1.66:1 against the page on Default and 2.08:1 on Brutalist, where WCAG 1.4.11 requires 3:1. A theme that needs a different ring overrides `--color-ring`; it must clear 3:1 against its own `--color-background` in both modes, and against any border colour the ring commonly sits beside. Two themes need a mode-specific override for this reason: Brutalist (yellow is 1.21:1 on its light page, so light mode uses magenta) and Terminal (whose "light" surface is a mid-grey `#d4d4d8`, so it rings at `primary-800` rather than the `primary-600` default).

Menu, listbox and calendar items are the documented exception: headless-UI roving focus is indicated by `data-highlighted` state, and `outline-none` on those is correct.

**The Dark-Ramp Direction Rule.** A theme's `.dark` block must keep the surface ramp pointing the same way as its light block — `50` light, `950` dark. `semantic.css` performs the inversion once for every theme by re-pointing `--color-background` at `surface-950`, `--color-foreground` at `surface-50`, and so on. A theme that also inverts its ramp cancels that out and ships a light "dark" mode. Supply night _colours_ at the dark end; never reverse the ordering.

---

## 3. Typography

**Default body and controls:** locally bundled Plus Jakarta Sans with Tajawal Arabic fallback. Private CSS family names keep the other themes' font loading independent.

**Default display:** locally bundled Newsreader normal and italic, paired with Noto Naskh Arabic. The serif applies to `h1` and `h2`; compact titles, navigation, labels, inputs, buttons and table data retain the sans-serif. `.font-display` lets an owned screen opt in and falls back to the active theme's sans-serif when that theme has no display face.

**Mono:** JetBrains Mono remains the existing code face.

**Other theme fonts:** Space Grotesk (Brutalist), Nunito and Fraunces (Ghibli), IBM Plex Sans (Blueprint), IBM Plex Sans, Newsreader and IBM Plex Mono (Analog), Rubik (Harbour/Sunset), and Plus Jakarta Sans (Pro) retain their existing request and scope.

### Hierarchy

- **Display:** Newsreader 500, fluid size on the public home page, close leading, `-0.025em` tracking. Arabic uses natural tracking and more vertical room.
- **Page heading:** serif 500, fixed sizes on working screens so responsive changes do not disturb control and table geometry.
- **Compact title:** sans-serif 600, 1.125rem.
- **Body:** sans-serif 400, 1rem for prose, 1.6 to 1.7 leading, 60 to 72ch measure. Existing dense controls may use their component sizes.
- **Label:** sans-serif 500, 0.875rem, with the component's existing touch target.
- **Numbers:** sans-serif tabular figures in tables and quantity controls.

### Loading and licensing

The four default families are bundled as WOFF2 subsets under `src/modules/app/assets/fonts/brand/`, with `font-display: swap` and complete OFL license files. Latin and extended Latin load only when needed; Arabic body and display faces load only for matching glyphs. Newsreader is an open-source alternative in the requested contemporary serif direction; the commercial Erato Nova font is not included.

The remaining themes keep their existing Google Fonts loading. A named font must always be loaded; declaring a family without its asset is not a completed type change. See the bundled font README for source versions and attribution.

### Named rules

**Display containment.** A serif belongs to major headings, never to controls or numeric data. Named themes keep their own typography decisions.

**Mono containment.** Monospace remains for code, terminal output and the Terminal theme. It is not the default prose face.

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

- **Shape:** `rounded-lg` → `--radius-lg` (default 0.5rem; 0 in Blueprint/Brutalist; up to 1.125rem in Ghibli and 1rem in Harbour)
- **Primary:** the default branding hook uses `primary-solid` and `primary-foreground`; named themes keep their existing primary recipe.
- **Secondary:** `bg-secondary-700 text-white`, with darker hover and active states.
- **Accent:** `bg-accent-700 text-white`, with a darker hover state.
- **Ghost:** `bg-transparent text-foreground`, with `bg-muted` on hover.
- **Destructive:** `bg-danger-700 text-white`, with a darker hover state.
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
- **Use `--color-primary-*` / `--color-surface-*` tokens for all color decisions.** Components that reference tokens work correctly in all 12 themes without modification.
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

Base values in app.css derive all three from the active ramps, so an unlisted theme still glows in its own hue.  
Own tinted values: Ocean, Forest, Sunset, Rose, Harbour, Pro, Ghibli (primary + secondary), Terminal (primary, dark only)  
Disabled (`none`): Analog, Blueprint, Brutalist

```
--shadow-glow-primary:   0 0 24px rgb(primary-500 / 0.3)
--shadow-glow-secondary: 0 0 24px rgb(secondary-500 / 0.3)
--shadow-glow-accent:    0 0 24px rgb(accent-500 / 0.3)
```

### Blueprint-Exclusive Tokens

```css
--blueprint-grid-major: rgb(37 87 214 / 0.14); /* 96px structural module */
--blueprint-grid-minor: rgb(37 87 214 / 0.06); /* 12px snap grid */
--blueprint-mark: rgb(37 87 214 / 0.55); /* corner registration marks */
--blueprint-rule: rgb(37 87 214 / 0.18); /* the inset drawing frame */
--blueprint-hatch: repeating-linear-gradient(…); /* 45° section poché */
```

Theme-local, like Ghibli's `--font-display`: they are not part of the semantic system and only rules inside `themes/blueprint.css` consume them. All five are redefined in the `.dark` block, where the palette inverts to the cyanotype. Do not replicate this pattern in other themes.

### The Page-Wash Rule

Three themes paint the page from `:root` rather than `body` — Blueprint's drafting grid, Harbour's four-layer wash, Ghibli's three-point painterly wash — so that the body's background transition cannot wipe it during mount. Anything set on `:root` is behind everything, which means **every full-viewport surface above it has to be made transparent, or the wash is invisible**. Ghibli shipped this way: it had a wash and rendered a flat page.

All six layout roots now use the same class, `bg-background min-h-screen` (or `h-screen` for docs). Two of them previously wrote `bg-surface-50 dark:bg-surface-950` — the same two colours `--color-background` already resolves to, spelled out — which meant a theme had to know about two conventions to clear one thing.

Each wash theme clears it with a **two-class** selector, `.bg-background.min-h-screen` / `.h-screen`. Deliberately not `.bg-background` alone: that would also catch the login form's "or" divider label, where the opaque background is exactly what punches a hole in the rule behind it. Two classes also mean no `!important` is needed — `:root.theme-x .bg-background.min-h-screen` outranks the utility on specificity.

<!-- SIDECAR END -->
