import process from 'node:process'

import { planComponent } from '../generators/component.mjs'
import { planIconSet } from '../generators/icon-set.mjs'
import { planModule } from '../generators/module.mjs'
import { planPage } from '../generators/page.mjs'
import { planTheme } from '../generators/theme.mjs'
import { formatTouchedFiles, logger } from '../lib/cli.mjs'
import { readLock, recordProvenance, writeLock } from '../lib/lockfile.mjs'
import { describeMissingSlot, loadManifest, missingSlots } from '../lib/manifest.mjs'
import { deriveModuleNames } from '../lib/naming.mjs'
import { Plan } from '../lib/plan.mjs'

/**
 * Scaffolding — `vuestrata add <kind> <name>`.
 *
 * Every generator plans first and writes second (see lib/plan.mjs), so
 * `--dry-run` is the same code path stopped one step earlier and cannot drift
 * from what a real run does.
 *
 * Everything written here is `seeded` — generated code is the project's from
 * the moment it lands.
 */
export const GENERATORS = {
  module: {
    plan: planModule,
    usage: 'add module <name> [--entity <singular>] [--nav-group <id>] [--icon <name>]',
    summary: 'A CRUD domain module: schema, queries, mock backend, three pages, i18n, registered.',
  },
  page: {
    plan: planPage,
    usage: 'add page <module> <name> [--kind list|detail|form|blank] [--nav]',
    summary: 'One page inside an existing module, wired into its routes.',
  },
  component: {
    plan: planComponent,
    usage: 'add component <Name> [--field]',
    summary: 'A Ui* wrapper, plus a forms composable when --field is passed.',
  },
  theme: {
    plan: planTheme,
    usage: 'add theme <name> [--label <Label>]',
    summary: 'A theme stylesheet with all four ramps in both modes, fully registered.',
  },
  'icon-set': {
    plan: planIconSet,
    usage: 'add icon-set <name> [--prefix <iconify-prefix>]',
    summary: 'An icon map covering every IconName, registered as a provider.',
  },
}

export function runAdd({ kind, positional, flags, root, version }) {
  const generator = GENERATORS[kind]
  if (!generator) {
    logger.error(`Unknown kind "${kind}". Known: ${Object.keys(GENERATORS).join(', ')}`)
    process.exit(1)
  }

  // Resolve where things live before planning anything. A generator that writes
  // to a path the project moved is worse than one that refuses to run: the
  // files land somewhere plausible, the registries never see them, and nothing
  // throws until the feature silently does not load.
  let manifest
  try {
    manifest = loadManifest(root)
  } catch (error) {
    logger.error(error.message)
    process.exit(1)
  }

  const missing = missingSlots(manifest)
  if (missing.length > 0) {
    logger.error('Some paths this project should have do not exist:')
    for (const entry of missing) logger.error(`  - ${describeMissingSlot(entry)}`)
    process.exit(1)
  }

  const plan = new Plan(manifest)

  try {
    generator.plan({
      plan,
      root,
      positional,
      options: {
        entity: flags.entity,
        navGroup: flags['nav-group'],
        icon: flags.icon,
        kind: flags.kind,
        label: flags.label,
        prefix: flags.prefix,
        nav: Boolean(flags.nav),
        field: Boolean(flags.field),
      },
      // Modules derive a whole name set; the other generators take the raw name.
      names: positional[0] ? deriveModuleNames(positional[0], flags.entity) : undefined,
      logger,
    })
  } catch (error) {
    logger.error(error.message)
    logger.log(`\n  ${generator.usage}\n`)
    process.exit(1)
  }

  const problems = plan.validate({ force: Boolean(flags.force) })

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ kind, ok: problems.length === 0, problems, ...plan.toJSON() }, null, 2)}\n`,
    )
    process.exit(problems.length === 0 ? 0 : 1)
  }

  if (problems.length > 0) {
    logger.error('Cannot generate — the plan would not apply cleanly:')
    for (const problem of problems) logger.error(`  - ${problem}`)
    process.exit(1)
  }

  if (flags['dry-run']) {
    logger.info(`Dry run — nothing written.\n`)
    for (const file of plan.files) logger.log(`  create  ${file.rel}  (${file.own})`)
    for (const edit of plan.edits) logger.log(`  edit    ${edit.rel}  (${edit.description})`)
    if (plan.notes.length) {
      logger.log('')
      for (const note of plan.notes) logger.log(`  next    ${note}`)
    }
    logger.log('')
    return
  }

  const result = plan.apply()

  // Record what landed, so a later `upgrade` can tell these files apart from
  // Vuestrata's own. Seeded entries are never replaced, but they still belong
  // in the lock: an upgrade needs to know they exist to leave them alone.
  const lock = readLock(root, { version })
  recordProvenance(lock, result.provenance, version)
  writeLock(root, lock)

  if (!flags['no-format']) formatTouchedFiles([...result.written, ...result.edited], root)

  logger.success(`Generated ${kind} "${positional[0]}"`)
  for (const rel of result.written) logger.log(`  create  ${rel}`)
  for (const rel of result.edited) logger.log(`  edit    ${rel}`)

  if (plan.notes.length) {
    logger.log('')
    logger.info('Still yours to do:')
    for (const note of plan.notes) logger.log(`  - ${note}`)
  }

  logger.log('')
  logger.info('Verify with:  vp check && vpr test --run')
  logger.log('')
}
