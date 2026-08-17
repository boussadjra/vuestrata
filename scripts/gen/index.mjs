import { spawnSync } from 'node:child_process'
import process from 'node:process'

import { createConsola } from 'consola'

import { planComponent } from './generators/component.mjs'
import { planIconSet } from './generators/icon-set.mjs'
import { planModule } from './generators/module.mjs'
import { planPage } from './generators/page.mjs'
import { planTheme } from './generators/theme.mjs'
import { deriveModuleNames } from './lib/naming.mjs'
import { Plan } from './lib/plan.mjs'

/**
 * Scaffolding entry point — `vp run gen:<kind> <name>`.
 *
 * Every generator plans first and writes second (see lib/plan.mjs), so
 * `--dry-run` walks the identical code path and stops before touching disk.
 * That is what makes the preview trustworthy enough for an agent to show a
 * human before committing to it, and `--json` is there so the agent can read
 * the result without parsing prose.
 */

const logger = createConsola({ level: 3, formatOptions: { colors: true, compact: false } })

const GENERATORS = {
  module: {
    plan: planModule,
    usage: 'gen:module <name> [--entity <singular>] [--nav-group <id>] [--icon <name>]',
    summary: 'A CRUD domain module: schema, queries, mock backend, three pages, i18n, registered.',
  },
  page: {
    plan: planPage,
    usage: 'gen:page <module> <name> [--kind list|detail|form|blank] [--nav]',
    summary: 'One page inside an existing module, wired into its routes.',
  },
  component: {
    plan: planComponent,
    usage: 'gen:component <Name> [--field]',
    summary: 'A Ui* wrapper, plus a forms composable when --field is passed.',
  },
  theme: {
    plan: planTheme,
    usage: 'gen:theme <name> [--label <Label>]',
    summary: 'A theme stylesheet with all four ramps in both modes, fully registered.',
  },
  'icon-set': {
    plan: planIconSet,
    usage: 'gen:icon-set <name> [--prefix <iconify-prefix>]',
    summary: 'An icon map covering every IconName, registered as a provider.',
  },
}

function parseArgs(argv) {
  const positional = []
  const flags = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }

  return { positional, flags }
}

function printUsage() {
  logger.log('')
  logger.log('Usage: vp run gen:<kind> <name> [options]')
  logger.log('')
  for (const generator of Object.values(GENERATORS)) {
    logger.log(`  ${generator.usage}`)
    logger.log(`      ${generator.summary}`)
  }
  logger.log('')
  logger.log('Common options:')
  logger.log('  --dry-run   Print what would be written and changed; write nothing.')
  logger.log('  --json      Machine-readable output (implies no colour).')
  logger.log('  --force     Overwrite files that already exist.')
  logger.log('')
}

/**
 * Format what we just wrote.
 *
 * The templates could be hand-matched to oxfmt's output instead, but that ties
 * every template to the current `fmt` settings in vite.config.ts — change
 * `printWidth` and every generator starts emitting code that fails
 * `vp fmt --check`. Running the formatter is the version that stays correct.
 *
 * Non-fatal: a generated-but-unformatted file is a nuisance, not a failure, and
 * `vp fmt` will fix it on the next commit via the staged hook.
 */
function formatTouchedFiles(files) {
  const targets = [...new Set(files)].filter((file) => /\.(ts|vue|json|css)$/.test(file))
  if (targets.length === 0) return

  const result = spawnSync('vp', ['fmt', ...targets], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    logger.warn(
      'Could not run `vp fmt` on the generated files — run it yourself before committing.',
    )
  }
}

async function main() {
  const [kind, ...rest] = process.argv.slice(2)

  if (!kind || kind === '--help' || kind === '-h') {
    printUsage()
    process.exit(kind ? 0 : 1)
  }

  const generator = GENERATORS[kind]
  if (!generator) {
    logger.error(`Unknown generator "${kind}". Known: ${Object.keys(GENERATORS).join(', ')}`)
    printUsage()
    process.exit(1)
  }

  const { positional, flags } = parseArgs(rest)
  const root = process.cwd()
  const plan = new Plan(root)

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
    for (const file of plan.files) logger.log(`  create  ${file.rel}`)
    for (const edit of plan.edits) logger.log(`  edit    ${edit.rel}  (${edit.description})`)
    if (plan.notes.length) {
      logger.log('')
      for (const note of plan.notes) logger.log(`  next    ${note}`)
    }
    logger.log('')
    return
  }

  const result = plan.apply()

  formatTouchedFiles([...result.written, ...result.edited])

  logger.success(`Generated ${kind} "${positional[0]}"`)
  for (const rel of result.written) logger.log(`  create  ${rel}`)
  for (const rel of result.edited) logger.log(`  edit    ${rel}`)

  if (plan.notes.length) {
    logger.log('')
    logger.info('Still yours to do:')
    for (const note of plan.notes) logger.log(`  - ${note}`)
  }

  logger.log('')
  logger.info('Verify with:  vp check && vp test --run')
  logger.log('')
}

main().catch((error) => {
  logger.error(error)
  process.exit(1)
})
