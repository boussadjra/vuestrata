import fs from 'node:fs'
import path from 'node:path'

import { inSlot, slot } from '../lib/manifest.mjs'
import { camel, kebab } from '../lib/naming.mjs'
import { insertBeforeSentinel, SENTINELS } from '../lib/registry.mjs'

/**
 * Scaffold an icon provider.
 *
 * `IconMap` is `Record<IconName, string>`, so a new provider must implement
 * every semantic name — currently 65 of them. Typing that list by hand is how
 * the old `ICON_NAMES` array in custom.ts fell nine names behind the union
 * without anyone noticing.
 *
 * So the generator reads the names from the union itself and emits a complete,
 * pre-filled map. Values are guessed from the Iconify prefix (`i-<prefix>-<name>`)
 * — many will be wrong, and that is fine: they are all present, typed, and the
 * icon-parity lint rule reports any left empty.
 */
export function planIconSet({ plan, root, positional, options }) {
  const raw = positional[0]
  if (!raw) throw new Error('an icon set name is required, e.g. `vpr gen:icon-set tabler`')

  const name = kebab(raw)
  const varName = `${camel(name)}IconMap`
  const prefix = options.prefix ?? name

  const iconNames = readIconNames(root, slot(plan.manifest, 'appTypes'))
  if (iconNames.length === 0) {
    throw new Error(`could not read the IconName union from ${slot(plan.manifest, 'appTypes')}`)
  }

  plan.addFile(
    inSlot(plan.manifest, 'iconMaps', `${name}.ts`),
    mapTemplate({ name, varName, prefix, iconNames }),
    { own: 'seeded' },
  )

  plan.addEdit(slot(plan.manifest, 'iconBarrel'), `export ${varName}`, (source) =>
    insertBeforeSentinel(source, SENTINELS.iconMaps, `export { ${varName} } from './maps/${name}'`),
  )

  plan.addNote(
    `Add \`${name}\` to ICON_PROVIDERS in src/modules/core/lib/config/env.schema.ts and to ` +
      '`builtinMaps` in src/modules/app/config/icon-provider.ts so it can be selected.',
  )
  plan.addNote(
    `Install the Iconify pack if it is not already a dependency: \`vp add -D @iconify-json/${prefix}\`, ` +
      'then confirm the classes resolve — a wrong name renders nothing rather than erroring.',
  )
  plan.addNote(
    `Add '${prefix}' to the collections list in src/modules/app/styles/icons-plugin.mjs. ` +
      'Without it Tailwind generates no CSS for the pack and every icon renders blank.',
  )
  plan.addNote(
    `Every value is a guess of the form \`i-${prefix}-<semantic-name>\`. Correct them against the ` +
      'pack, then run `node scripts/lint/run-custom-rules.mjs` to confirm none are empty.',
  )

  return plan
}

function readIconNames(root, typesPath) {
  const source = fs.readFileSync(path.join(root, typesPath), 'utf8')
  const start = source.indexOf('export type IconName')
  if (start === -1) return []

  const names = []
  for (const line of source.slice(start).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const match = trimmed.match(/^\|\s*'([^']+)'/)
    if (!match) break
    names.push(match[1])
  }
  return names
}

function mapTemplate({ name, varName, prefix, iconNames }) {
  const entries = iconNames
    .map((iconName) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(iconName) ? iconName : `'${iconName}'`
      return `  ${key}: 'i-${prefix}-${iconName}',`
    })
    .join('\n')

  return `import type { IconMap } from '~/types'

/**
 * ${name} icon provider.
 *
 * GENERATED — every value below is a guess of the form \`i-${prefix}-<semantic-name>\`.
 * Iconify pack names rarely line up with our semantic names, so most need
 * correcting against the real pack. The keys, however, are complete and typed:
 * \`IconMap\` is \`Record<IconName, string>\`, so the compiler will tell you if a
 * name is ever added to the union and not to this file.
 *
 * An entry left as an empty string renders an empty span with no error, which
 * is why the icon-parity lint rule fails on one.
 */
export const ${varName}: IconMap = {
${entries}
}
`
}
