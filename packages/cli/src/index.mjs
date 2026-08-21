#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { GENERATORS, runAdd } from './commands/add.mjs'
import { runDoctor } from './commands/doctor.mjs'
import { runEject } from './commands/eject.mjs'
import { runInit } from './commands/init.mjs'
import { runUpgrade } from './commands/upgrade.mjs'
import { logger, parseArgs } from './lib/cli.mjs'
import { loadAllMigrations } from './lib/migrations.mjs'

/**
 * `vuestrata <command>` — scaffold, inspect and upgrade a Vuestrata project.
 *
 * The CLI ships in the same repository as the template it edits. That is
 * deliberate: migrations and the code they migrate version together, and CI can
 * run the CLI against the template itself, which is the only test that actually
 * proves a generator still wires what it claims to wire.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

function cliVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8'))
  return pkg.version
}

const COMMANDS = {
  init: {
    usage: 'init [--force] [--pristine]',
    summary: 'Start tracking an existing project: write the manifest and the lockfile.',
  },
  add: {
    usage: 'add <kind> <name> [options]',
    summary: 'Scaffold a module, page, component, theme or icon set.',
  },
  diff: {
    usage: 'diff [--json]',
    summary: 'Show what an upgrade would change. Writes nothing.',
  },
  upgrade: {
    usage: 'upgrade [--allow-dirty] [--json]',
    summary: 'Run migrations and install this release, preserving files you edited.',
  },
  doctor: {
    usage: 'doctor [--json]',
    summary: 'Check that slots resolve, anchors survive, and the lockfile agrees with disk.',
  },
  eject: {
    usage: 'eject [--keep <ids>] [--keep-docs] [--dry-run]',
    summary: 'Remove the demo modules, showcase and docs site, and stop tracking them.',
  },
}

function printUsage() {
  logger.log('')
  logger.log('Usage: vuestrata <command> [options]')
  logger.log('')
  for (const command of Object.values(COMMANDS)) {
    logger.log(`  ${command.usage}`)
    logger.log(`      ${command.summary}`)
  }
  logger.log('')
  logger.log('Kinds for `add`:')
  for (const generator of Object.values(GENERATORS)) {
    logger.log(`  ${generator.usage}`)
    logger.log(`      ${generator.summary}`)
  }
  logger.log('')
  logger.log('Common options:')
  logger.log('  --dry-run   Print what would be written and changed; write nothing.')
  logger.log('  --json      Machine-readable output.')
  logger.log('  --no-format Skip running the formatter over what was written.')
  logger.log('  --force     Overwrite files that already exist.')
  logger.log('')
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    process.exit(command ? 0 : 1)
  }

  if (command === '--version' || command === '-v') {
    logger.log(cliVersion())
    return
  }

  const { positional, flags } = parseArgs(rest)
  const root = process.cwd()
  const version = cliVersion()

  // Loaded once, up front: the command functions are synchronous so that `diff`
  // and `upgrade` can share a single traversal rather than growing two.
  await loadAllMigrations()

  switch (command) {
    case 'init':
      return runInit({ root, version, flags })

    case 'add': {
      const [kind, ...args] = positional
      if (!kind) {
        logger.error('`add` needs a kind. Known: ' + Object.keys(GENERATORS).join(', '))
        printUsage()
        process.exit(1)
      }
      return runAdd({ kind, positional: args, flags, root, version })
    }

    case 'diff':
      return runUpgrade({ root, version, flags, apply: false })

    case 'upgrade':
      return runUpgrade({ root, version, flags, apply: true })

    case 'doctor':
      return runDoctor({ root, version, flags })

    case 'eject':
      return runEject({ root, flags })

    default:
      // `vuestrata module payments` still works — the `vpr gen:*` scripts have
      // called it that way since before `add` existed, and breaking them to
      // save one word would be the exact churn this tool exists to prevent.
      if (GENERATORS[command]) {
        return runAdd({ kind: command, positional, flags, root, version })
      }

      logger.error(`Unknown command "${command}".`)
      printUsage()
      process.exit(1)
  }
}

main().catch((error) => {
  logger.error(error)
  process.exit(1)
})
