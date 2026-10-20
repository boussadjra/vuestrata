# Visual redesign verification — 15 October 2026

The default identity uses midnight `#031b38`, copper `#cf4c18` and paper
`#f3efe3`, with locally bundled Newsreader display type, Plus Jakarta Sans
controls, and Naskh/Tajawal Arabic faces. Small copper text uses a darker shade
for contrast. The other eleven theme personalities retain their own tokens.

The public home now includes an interactive architecture preview, live theme
selection, a type specimen and direct links to working examples. Route pages
remain thin. Branding uses seeded seams; managed UI, auth and core files were
not edited. The same identity is applied to the local Stockroom project,
whose working overview and staff login have their own compositions.

## Local validation

| Check                                    | Result                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `vp check`                               | PASS: formatting, lint and application types; 47 existing warnings, zero errors                                       |
| `vp run lint`                            | PASS: custom architecture/i18n/icon/theme rules, toolchain pins, MSW worker, security headers and documentation links |
| `vp run typecheck:e2e`                   | PASS                                                                                                                  |
| Application tests, excluding CLI         | PASS: 178 files passed, one skipped; 4,472 tests passed, ten skipped                                                  |
| Final logo/header component checks       | PASS: 20/20 tests after the compact mobile logo refinement                                                            |
| Final affected CLI suites                | PASS: eject and payload, 80/80 tests                                                                                  |
| Maintainer metadata                      | PASS: lockfile, payload and migration copies                                                                          |
| Actual packed CLI archive                | PASS: all 15 font/license companion files match source bytes; ten CSS font URLs resolve                               |
| Demo build and bundle verification       | PASS: 12 checks; initial payload 492.7 KB gzip                                                                        |
| Production build and bundle verification | PASS: 17 checks; initial payload 487.1 KB gzip; no MSW, mock auth or demo account                                     |
| Built-artifact browser journeys          | PASS: 28/28, Chromium desktop and Pixel 5 emulation, one worker, zero retries                                         |

The browser matrix covers English, French and Arabic, light/dark modes, the
existing public navigation/auth routes, keyboard interaction, theme persistence,
horizontal overflow, local font loading with external font services blocked,
and serious/critical WCAG A/AA axe findings on the new home. Screenshots were
inspected for desktop and mobile. Physical devices, Firefox and Safari were
not exercised in this redesign pass.

Visual review caught a scoped CSS selector mirroring the whole Arabic page.
The selector now targets only its intended arrow; the final browser matrix
asserts that the document root has no transform. Initial development-server
checks encountered cold-route compilation delays; the passing final matrix
uses the built artifact at `http://127.0.0.1:4173/`.

At narrow widths the logo uses its symbol, retaining its accessible name and
leaving room for the language control. The final browser matrix checks the
actual SVG and language-control bounds for overlap in every locale and mode.

The broader CLI/public-surface run recorded 641 passing tests and one skip,
plus a timeout in a large byte comparison. Replacing that comparison with
native byte equality and independent SHA-256 checks preserved its assertions;
the final 80-test affected-suite run passes with unchanged timeouts. The entire
broader CLI run was not repeated after that focused correction.

## Boundaries

Stockroom's fresh frontend, Docker and browser results are recorded separately
in its `docs/VERIFICATION.md`. Its database was not reset for this visual work.
Backend business tests and coverage were not rerun for this frontend change.
No publication, push or GitHub Actions run was requested or performed.

## Homepage enrichment and geological default — 15 October 2026

This follow-up adds three sections, bringing the home to eight: an interactive
module walkthrough, a file-ownership explanation and practical questions. The
module selector previews real generator commands and the files they affect;
it does not execute them. The questions use native keyboard-accessible
disclosures. English, French and Arabic supporting copy was rewritten, with
87 override keys per locale, including 37 new keys.

The hero highlights escaped, static code tokens from real page, feature and
shared-code examples. It uses no runtime highlighter or HTML injection. Code
remains left-to-right in Arabic, with keyboard-accessible horizontal scrolling.

The default theme now has six native SVG geological variants: full-colour and
quiet ambient artwork for light/dark modes, plus reflected ambient artwork for
RTL. Only the artwork is reflected. Panels remain opaque, other themes keep
their own styling, and Stockroom uses the same brand stylesheet byte for byte.

| Follow-up check                          | Result                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `vp check`                               | PASS: formatting, lint and application types; zero errors and 47 existing warnings             |
| `vp run lint`                            | PASS: custom rules, toolchain pins, MSW worker, headers and documentation links                |
| `vp run typecheck:e2e`                   | PASS                                                                                           |
| Maintainer metadata                      | PASS: template lockfile, CLI payload and migration copies                                      |
| Documentation links                      | PASS: 262 paths and 102 links                                                                  |
| Final demo build and bundle checks       | PASS: 12 checks; initial payload 496.0 KB gzip                                                 |
| Final production build and bundle checks | PASS: 17 checks; initial payload 490.5 KB gzip; no MSW, mock auth or demo account              |
| Final built-artifact browser matrix      | PASS: 30/30, desktop Chromium and Pixel 5 emulation, one worker, zero retries; 2.2 minutes     |
| Stockroom browser checks                 | PASS: 4/4 journeys, including 48 accessibility audits across locales, modes and viewport sizes |

The final home matrix checks visible syntax colours, keyboard selection of
module examples, FAQ interaction, default-theme isolation, Arabic direction,
section margins, horizontal overflow, local fonts and serious/critical axe
findings. Final screenshots were inspected for the hero, new sections and
Arabic mobile layout. A scoped container rule was corrected before this final
matrix so nested sections retain their page margins.

Stockroom's web image was rebuilt and its health checks pass. Its database
and PHP containers were preserved, and the browser checks reject business-data
writes. Fresh details and screenshots are recorded in the consumer project's
`docs/VERIFICATION.md`.

The application, full CLI, backend and coverage suites were not rerun for this
visual follow-up; earlier results above remain historical. Physical devices,
Firefox and Safari remain untested. Changes remain local, with no commit,
push or GitHub Actions run in this follow-up.

## Plain backgrounds — 15 October 2026

At the user's request, the geological artwork was removed from the shared
default-theme stylesheet, the home hero, the ownership section and the closing
section. The ambient SVG variants, decorative colour aliases and transparent
layout overrides were deleted. The default uses plain paper/navy surfaces again.
Typography, palette, highlighted code, copy and all eight home sections remain.

Fresh `vp check` passes with zero errors and 47 existing warnings. The demo
build and all 12 bundle checks pass, with an initial payload of 494.3 KB gzip.
The CLI payload was rebuilt, and all three maintainer metadata gates and the
documentation link check pass. Source and payload brand stylesheets match.

The focused built-artifact browser matrix passes 18/18 tests with zero retries
across desktop Chromium and Pixel 5 emulation. It covers EN/FR/AR, light/dark,
plain background assertions, layout bounds, syntax colours, keyboard controls,
theme persistence, fonts and serious/critical axe findings. Final hero and
ownership-section screenshots were visually inspected.

An initial browser invocation selected the wrong test scope and could not find
the sandbox browser executable. It was stopped; the final passing run uses the
intended spec and the existing local Chromium installation. No application
change was needed for that launch issue.

The same stylesheet removal is applied to Stockroom; its fresh build and
read-only browser results are recorded in its own `docs/VERIFICATION.md`.
Full unit, coverage, backend and source production suites were not repeated
for this removal. No commit, push or GitHub Actions run was performed.

## Three-bar SVG identity and source excerpts — 15 October 2026

The supplied reference was redrawn as three parallel copper parallelograms
rising to the right. The navy badge and its transparent mark use the same
vector path. Exports are `public/logo.svg`, `public/favicon.svg` and
`public/brand-mark.svg`. All three parse as valid SVG; the badge and favicon
are byte-identical. The icon fits within the manifest's maskable safe area.

The seeded Logo component supplies the header, sidebar, footer and auth
screens. Its public title/class/variant interface and narrow-screen icon
behaviour are preserved. The Latin wordmark has an explicit left-to-right
direction and uses the local Jakarta face, keeping it within its viewBox
across locales and themes. The hero uses the same vector mark. The manifest
is linked from the document and uses the navy/paper colours, retaining its
relative icon, start and scope paths.

The hero now shows verbatim contiguous source excerpts with full file paths
and actual line numbers: customers' detail page, customers' collection API,
and the shared money function. Three parity tests reconstruct the highlighted
tokens and compare them with the referenced source slices. EN/FR/AR labels
identify the examples as code from this repository. Highlighting remains
escaped text, with keyboard scrolling and left-to-right code in Arabic.

| Current check                      | Result                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full frontend check                | PASS: formatting, lint and application types; zero errors, 47 existing warnings                                        |
| Focused component and parity tests | PASS: 15/15                                                                                                            |
| E2E types                          | PASS                                                                                                                   |
| Final demo build and bundle        | PASS: 12 checks; 489.4 KB initial gzip                                                                                 |
| CLI payload and metadata           | PASS: final Logo bytes match source; all three maintainer gates and docs links pass                                    |
| Final homepage browser matrix      | PASS: 18/18, desktop Chromium and Pixel 5 emulation, zero retries; 4.0 minutes                                         |
| Stockroom verification             | PASS: 12 focused tests, frontend gates, 17 production bundle checks, four browser cases and eight accessibility audits |

The browser matrix checks wordmark bounds as well as mobile header spacing,
EN/FR/AR light/dark layouts, syntax colours, keyboard interaction, fonts and
serious/critical axe findings. Final hero screenshots were inspected. An
initial bound assertion was too strict for the V's natural ink overhang; it
now checks the intended gap after the badge and the right clipping boundary.
One initial cold-load wait also failed; the complete final matrix passes with
the same timeouts and no retries.

Stockroom shares the exact static SVGs and the badge geometry, while keeping
its product name and warehouse illustration. Its refreshed web container is
healthy, with the database/PHP containers and business data preserved. Fresh
consumer results and screenshots are in its `docs/VERIFICATION.md`.

Full application/CLI/coverage/backend suites and a separate source production
build were not repeated for this branding change. No commit, push or GitHub
Actions run was performed.

## Subtle default-theme gradients — 18 October 2026

The default theme now has one broad, static 132-degree background gradient.
Light mode moves from warm paper through the existing paper anchor to a cool
paper shadow; dark mode moves through three navy tones. The new stops use
OKLCH colours and OKLab interpolation. The same background paints the body
and paired full-height layout roots directly, without transparent panel
overrides. Cards, inputs, navigation and inverse sections retain solid surfaces.
The gradient scrolls normally. It adds no overlay, animation, mesh, glow or
geological pattern. The eleven named themes retain their own backgrounds.

Only the seeded `brand.css` changes the interface. The CLI payload was rebuilt;
its stylesheet matches the source SHA256
`20CA687EE5A335AC7F194B67815ED0A81563EB570A837D8BFC99FEDAF67BCA14`.
The identical stylesheet is applied to Stockroom. No managed infrastructure,
component, content, font or logo changed.

Contrast was sampled at 10,001 positions along each gradient using the actual
rounded CSS declarations and the 48% centre stop. Minimum ratios are:

| Text role  | Light  | Dark   |
| ---------- | ------ | ------ |
| Muted      | 5.206  | 8.315  |
| Link       | 4.823  | 5.770  |
| Hover link | 6.122  | 8.402  |
| Foreground | 14.145 | 12.578 |

These samples meet AA normal-text contrast. All sampled colours remain within
the sRGB gamut, and no intermediate point reduces contrast below the endpoints.

| Current check                     | Result                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Frontend check                    | PASS: formatting, lint and application types; zero errors, 47 existing warnings                                 |
| E2E types                         | PASS                                                                                                            |
| Demo build and bundle             | PASS: all 12 checks; initial payload 489.6 KB gzip                                                              |
| CLI metadata and project rules    | PASS: three maintainer gates, all six custom rules and documentation links                                      |
| Homepage browser matrix           | PASS: 18/18, desktop Chromium and Pixel 5 emulation, one worker, zero retries; 2.7 minutes                      |
| Stockroom frontend and production | PASS: frontend check, lint, ownership checks and all 17 production bundle checks; initial payload 386.9 KB gzip |
| Stockroom browser matrix          | PASS: four cases and eight accessibility audits, EN desktop and AR mobile, light/dark login and overview        |

The source matrix checks the linear gradient, ordinary scrolling, theme
isolation, EN/FR/AR direction and bounds, fonts, syntax colours, keyboard
controls and serious/critical axe findings. The light hero, dark page and Arabic
mobile screenshots were inspected. The live preview also confirms matching
body/layout gradients and a solid code illustration. An initial preview process
was unreachable from the host browser; restarting it with normal host access
resolved the connection without network or firewall changes.

Stockroom's web image was rebuilt and the existing database/PHP containers
were preserved. Its read-only browser checks verify matching body/layout
gradients, opaque cards and inputs, session login and no business-data writes.
Fresh consumer evidence is recorded in its `docs/VERIFICATION.md`.

Full unit, CLI, coverage and backend suites, physical-device acceptance and a
separate source production build were not repeated for this CSS refinement.
Earlier entries remain historical. This refinement is local and uncommitted;
no push or GitHub Actions run was performed.

## Structure made visible — 18 October 2026

The light-mode canvas is now cool silver, with no cream stop: `#edf3f6` through
`#e5edf2` to `#dce7ee`. Cards use `#f7fafb`. Exact navy `#031b38` and copper
`#cf4c18` remain the identity anchors; paper `#f3efe3` is reserved for inverse
ink and selected accents. The initial loader and manifest background use the
same silver canvas.

Locally bundled Commissioner now carries upright headings and working UI,
with Tajawal for Arabic. The serif remains a small, upright accent in the
theme specimen. The logo keeps its existing wordmark and vector geometry.
Compact corners, flat resting cards and solid navy navigation selections apply
through the seeded brand seam, preserving explicit shape preferences.

The home page gives more width to real source code. Three stepped Page,
Feature and Shared controls echo the rising-bar mark and keep their existing
keyboard and ARIA behaviour. The italic headline, tracked miniature labels
and floating source-panel shadow are removed. EN/FR/AR headlines now describe
the application's structure. Other home sections and application workflows
remain in place.

The final source/payload stylesheet SHA256 is
`354D1CDC5D0B07BA1E69B869B89534D5766EB058ECB511C0DBB2D3FFE03FFA25`.
All 18 local font companions, including 12 WOFF2 files and five licenses,
match the CLI payload byte for byte. The template lock records the three new
Commissioner companions as seeded files. No managed component was edited.

Sampling 10,001 points along each gradient gives the following minimum
normal-text contrast ratios. All samples remain in the sRGB gamut.

| Text role  | Light  | Dark   |
| ---------- | ------ | ------ |
| Foreground | 13.720 | 12.578 |
| Muted      | 5.576  | 8.315  |
| Link       | 4.678  | 5.770  |
| Hover link | 5.938  | 8.402  |

The selected copper source-layer control measures 6.492:1. These are AA
results, without an AAA claim. A real Stockroom axe check found dark inherited
ink on the new navy selected-navigation surface. The final seeded CSS now
sets inverse ink explicitly for current links, selected collapsed branches
and hovered navigation items. Consumer checks cover the selected label and
its child text as well as an inactive item's hover state.

Fresh source formatting, lint, application types and E2E types pass, with
zero errors and 47 existing warnings. All six custom rules, documentation
links, toolchain pins, security headers and MSW checks pass. The 23 focused
source-excerpt and CLI payload/font-upgrade tests pass with one worker.
All three maintainer gates pass after the final payload refresh, including
the template lock and 12 migration copies.

The final demo build passes all 12 bundle checks: 490.1 KB initial gzip and
651.0 KB eagerly loaded CSS, within the existing budgets. Stockroom's final
web-only production build passes Linux types and all 17 bundle checks:
387.4 KB initial gzip and 596.3 KB CSS. Its corrected web image is
`6f3614f175e2e5a844aba9849b3314638cd30558c8782f32e62d07296b98b23c`.

The final built-artifact browser run passes 30/30 tests in 2.2 minutes,
with desktop Chromium and Pixel 5 emulation, one worker and zero retries.
It covers EN/FR/AR light/dark layouts, serious/critical axe findings, bounds,
keyboard controls, local fonts, theme isolation, component-doc navigation,
login/register screens and the not-found route. Final light, dark and Arabic
mobile screenshots were inspected; the live preview is left in light mode.

Stockroom passes four final browser cases, eight accessibility audits and
eight visually inspected screens, covering EN desktop and AR mobile in both
colour modes. Real login, session and dashboard requests succeed. Its checks
reject business-data writes and verify opaque panels, local fonts, selected
and hovered navigation ink and layout bounds. The existing database/PHP
containers were preserved; `/healthz` and `/up` return 200. Its own
`docs/VERIFICATION.md` contains the current consumer evidence.

Full application, CLI, coverage and backend suites, manual screen-reader
acceptance, physical devices and a separate source production build were
not repeated for this identity change. The 23 focused tests and the browser
results above are fresh; earlier entries remain historical. No commit, push
or GitHub Actions run was performed.

## Provider icons, ribbon and numbered markers — 18 October 2026

Decorative navigation arrows on the home page now use the existing `AppIcon`
component and the selected provider's `arrow-right` or `arrow-down` icon.
Horizontal arrows mirror in Arabic; downward cues keep their direction.
Real source excerpts and the architecture's textual arrow notation are
unchanged. No new icon key or managed component change was needed.

The translated template label sits inside a bold navy ribbon with a notched
trailing edge. Its notch and padding mirror in Arabic. Fifteen sequential
markers across the source preview, principles, workflow, ownership and
example links now sit inside filled squares. Corners follow the active
theme's radius token; source-code line numbers remain plain. The preview's
numbers remain part of each button's accessible name.

Fresh `vp check`, application and E2E types pass with zero errors and
47 existing warnings. Full lint, all six custom rules, docs links, headers,
worker and toolchain checks pass. All three maintainer gates pass without
a payload refresh. The 63 focused source-excerpt and CLI ejection tests
pass across two files with one worker. An initial Windows sandbox cache
permission failure occurred before test collection; the same focused
command passed on the normal host.

The demo build passes all 12 bundle gates, with a 490.1 KB initial gzip
payload. The final browser matrix passes 18/18 in 2.1 minutes, with desktop
Chromium and Pixel 5 emulation, one worker and zero retries. It covers
EN/FR/AR light/dark, Solar and Lucide masks, RTL direction, ribbon bounds,
all fifteen shaped markers, keyboard behaviour and serious/critical axe
findings. Final hero, workflow and Arabic mobile screenshots were inspected.

Stockroom's relevant overview link also uses `AppIcon`; its marketing home
was ejected, so no ribbon or marketing numbering was added there. Its
frontend gates, Linux types and all 17 production bundle checks pass,
with 387.4 KB initial gzip. Four read-only browser cases and eight axe
audits pass, including Solar/Lucide masks, 16px icon sizing, decorative
semantics, preserved EN/AR link names and Arabic direction. The current
web image is `01566afa18a12ab09eadcf9ac11f0698fa5ca072392f9e36b0579e9f2fc9920b`.
Database/PHP container identities and business data were preserved; fresh
consumer details are in its `docs/VERIFICATION.md`.

The shared branding stylesheet remains unchanged at SHA256
`354D1CDC5D0B07BA1E69B869B89534D5766EB058ECB511C0DBB2D3FFE03FFA25`.
Full application/CLI/coverage/backend suites, physical devices and a separate
source production build were not repeated for this small visual follow-up.
Earlier results remain historical. No commit, push or GitHub Actions run
was performed.

## Application-led hero visual, 20 October 2026

The large inverse source editor is replaced with an illustrative customer-list
screen on the active theme's card surface. A quiet navigation rail and row
separators carry the application view. The Page, Feature and Shared controls
remain keyboard operable below it; each displays two or three verbatim source
lines with highlighting. File paths, line gutters and diagnostic-style chrome
are removed. The code stays LTR in Arabic. Preview labels and short layer
descriptions are provided in EN/FR/AR; the French feature label is “Module”
to avoid a broken word at 320px.

Final local checks passed: `vp check` (0 errors, 47 existing warnings), full
lint/custom rules, E2E types, all three source-excerpt parity tests, demo build,
all 12 demo bundle gates and all three maintainer gates. The CLI's seeded
locale payload was regenerated. The final desktop/mobile browser suite passed
18/18 cases, including EN/FR/AR in both modes, keyboard interaction, source
highlighting and workspace overflow checks. Its axe assertions cover serious
and critical findings, not complete WCAG conformance.

Manual browser inspection additionally covered 320px French and Arabic,
dark mode, layer switching, and restoration to English/light mode. No new
browser console errors were observed. Evidence is saved under the session's
`hero-20261020` visualization folder, including `hero-final.jpg`, `check.log`,
`build.log` and `browser.log`. The local preview is running on port 4173.
Stockroom, backend behaviour and the unresolved broader UI audit were outside
this hero-only change. No remote publication or GitHub Actions run occurred.
