import type { IconMap, IconName } from '~/types'

import { solarIconMap } from './solar'

/**
 * Template for a custom icon map.
 *
 * To create your own icon set:
 * 1. Copy this file to a new file (e.g., `my-icons.ts`)
 * 2. Fill in all values with your icon CSS classes
 * 3. Register it via `registerIconMap('my-icons', myIconMap)` in your app setup
 *
 * Each key is a semantic icon name used across the app.
 * Each value is the CSS class that renders that icon (e.g., Iconify class or custom font icon).
 */

/**
 * Every semantic icon name, derived rather than hand-listed.
 *
 * `solarIconMap` is typed `IconMap` (= `Record<IconName, string>`), so the
 * compiler already guarantees it has exactly one entry per `IconName`. Reading
 * its keys is therefore the same set as the union, and cannot drift from it.
 * A literal array here previously fell nine names behind the union with
 * nothing to catch it; the derivation removes the failure mode rather than
 * repairing one instance of it. Any complete map would do — solar is the
 * default provider, so it is the natural one to read.
 */
const ICON_NAMES = Object.keys(solarIconMap) as IconName[]

export function createCustomIconMap(entries: Partial<IconMap>): IconMap {
  const map = {} as Record<string, string>
  for (const name of ICON_NAMES) {
    map[name] = entries[name] ?? ''
  }
  return map as IconMap
}
