import { APP_SCOPE, UPSTREAM_SCOPE } from '../src/lib/registry.mjs'

/**
 * Split each single `gen:<region>` marker into a `vuestrata:` / `app:` pair.
 *
 * One region meant an upstream release and a local `gen:module` run both
 * appending at the same line. That is a collision on every upgrade, in the one
 * file whose breakage is silent — a module missing from `setup.ts` does not
 * throw, the feature simply never loads.
 *
 * ── Which side inherits the existing entries ───────────────────────────────
 *
 * It depends on who is running this, and getting it backwards would hand
 * someone's own modules to the upgrade path to overwrite.
 *
 * In a project built from the template, everything inside the old region was
 * written by that project's own generator runs, so it is app-scoped — that is
 * the `keepIn: 'app'` default, and it is what the shipped migration uses.
 *
 * In this repository the same entries arrived from upstream's generator runs
 * (the `pro` and `analog` themes, the six extra icon maps), so the one-off
 * split that introduced the namespaces ran with `keepIn: 'vuestrata'`.
 */
export function splitRegion(source, region, { comment = '//', keepIn = APP_SCOPE } = {}) {
  const closeSuffix = comment === '/*' ? ' */' : ''
  const startMarker = `${comment} gen:${region}-start${closeSuffix}`
  const endMarker = `${comment} gen:${region}-end${closeSuffix}`

  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker)

  if (startIndex === -1 || endIndex === -1) {
    // Already split, or this registry never carried the old marker. Both fine.
    return source
  }

  const lineStart = source.lastIndexOf('\n', startIndex) + 1
  const indent = source.slice(lineStart, startIndex)

  const entries = source
    .slice(startIndex + startMarker.length, endIndex)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => `${indent}${entry}`)

  const marker = (scope, edge) => `${indent}${comment} ${scope}:${region}-${edge}${closeSuffix}`

  // Upstream first, always. A generated entry appended to the app region then
  // lands below everything upstream ships, never between two of its lines.
  const replacement = [
    marker(UPSTREAM_SCOPE, 'start'),
    ...(keepIn === UPSTREAM_SCOPE ? entries : []),
    marker(UPSTREAM_SCOPE, 'end'),
    marker(APP_SCOPE, 'start'),
    ...(keepIn === APP_SCOPE ? entries : []),
    marker(APP_SCOPE, 'end'),
  ].join('\n')

  return source.slice(0, lineStart) + replacement + source.slice(endIndex + endMarker.length)
}
