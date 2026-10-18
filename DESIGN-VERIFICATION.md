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
