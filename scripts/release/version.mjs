import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const DEFAULT_PREID = 'alpha'
const VALID_COMMANDS = new Set([
  'show',
  'set',
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
])

function parseArgs(argv) {
  const [command, ...rest] = argv
  if (!command || !VALID_COMMANDS.has(command)) {
    throw new Error(
      `Expected one of ${Array.from(VALID_COMMANDS).join(', ')}. Received ${JSON.stringify(command)}.`,
    )
  }

  let preid = DEFAULT_PREID
  let dryRun = false
  let json = false
  const positional = []

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (token === '--dry-run') {
      dryRun = true
      continue
    }
    if (token === '--json') {
      json = true
      continue
    }
    if (token === '--preid') {
      const value = rest[index + 1]
      if (!value) throw new Error('--preid requires a value.')
      preid = value
      index += 1
      continue
    }
    positional.push(token)
  }

  return { command, preid, dryRun, json, positional }
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  const [, major, minor, patch, prereleaseRaw] = match
  const prerelease = prereleaseRaw ? prereleaseRaw.split('.') : []

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
  }
}

function formatVersion(parsed) {
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  return parsed.prerelease.length ? `${base}-${parsed.prerelease.join('.')}` : base
}

function nextPreSequence(prerelease, preid) {
  if (prerelease[0] === preid && /^\d+$/.test(prerelease[1] ?? '')) {
    return [preid, String(Number(prerelease[1]) + 1)]
  }
  return [preid, '0']
}

function bump(parsed, command, preid) {
  const next = { ...parsed, prerelease: [...parsed.prerelease] }

  switch (command) {
    case 'patch':
      next.patch += 1
      next.prerelease = []
      return next
    case 'minor':
      next.minor += 1
      next.patch = 0
      next.prerelease = []
      return next
    case 'major':
      next.major += 1
      next.minor = 0
      next.patch = 0
      next.prerelease = []
      return next
    case 'prepatch':
      next.patch += 1
      next.prerelease = [preid, '0']
      return next
    case 'preminor':
      next.minor += 1
      next.patch = 0
      next.prerelease = [preid, '0']
      return next
    case 'premajor':
      next.major += 1
      next.minor = 0
      next.patch = 0
      next.prerelease = [preid, '0']
      return next
    case 'prerelease':
      if (!next.prerelease.length) {
        next.patch += 1
        next.prerelease = [preid, '0']
        return next
      }
      next.prerelease = nextPreSequence(next.prerelease, preid)
      return next
    default:
      throw new Error(`Unsupported command: ${command}`)
  }
}

/**
 * Every package.json a release moves, root first.
 *
 * `packages/cli` is not optional here. Its version is the template version a
 * project receives — `upgrade` stamps it into the lockfile and
 * `build-payload.mjs` into the payload index — so a CLI left behind a root bump
 * publishes a payload labelled as a release it is not.
 */
async function packageJsonPaths() {
  const paths = [path.join(repoRoot, 'package.json')]
  const packagesDir = path.join(repoRoot, 'packages')

  let entries = []
  try {
    entries = await readdir(packagesDir, { withFileTypes: true })
  } catch {
    return paths
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(packagesDir, entry.name, 'package.json')
    if (existsSync(candidate)) paths.push(candidate)
  }

  return paths
}

async function readPackages() {
  const packages = []
  for (const file of await packageJsonPaths()) {
    packages.push({ file, pkg: JSON.parse(await readFile(file, 'utf8')) })
  }
  return packages
}

async function writePackages(packages, nextVersion) {
  for (const entry of packages) {
    entry.pkg.version = nextVersion
    await writeFile(entry.file, `${JSON.stringify(entry.pkg, null, 2)}\n`, 'utf8')
  }
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll('\\', '/')
}

function writeStdout(message) {
  process.stdout.write(`${message}\n`)
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`)
}

function printResult({ command, currentVersion, nextVersion, dryRun, json, packages, drifted }) {
  if (json) {
    writeStdout(
      JSON.stringify(
        {
          command,
          currentVersion,
          nextVersion,
          dryRun,
          packages: packages.map((entry) => ({
            file: relative(entry.file),
            version: command === 'show' || dryRun ? entry.pkg.version : nextVersion,
          })),
        },
        null,
        2,
      ),
    )
    return
  }

  if (command === 'show') {
    writeStdout(currentVersion)
    for (const entry of drifted) {
      writeStderr(
        `[version] ${relative(entry.file)} is at ${entry.pkg.version}, not ${currentVersion}`,
      )
    }
    return
  }

  const action = dryRun ? 'Would set' : 'Set'
  writeStdout(`${action} version ${currentVersion} -> ${nextVersion}`)
  for (const entry of packages) writeStdout(`  ${relative(entry.file)}`)
}

async function main() {
  const { command, preid, dryRun, json, positional } = parseArgs(process.argv.slice(2))
  const packages = await readPackages()
  const [root] = packages
  const currentVersion = String(root.pkg.version)

  // The root is the source of truth; anything else is reported so a drift is
  // visible rather than quietly overwritten.
  const drifted = packages.slice(1).filter((entry) => String(entry.pkg.version) !== currentVersion)

  if (command === 'show') {
    printResult({
      command,
      currentVersion,
      nextVersion: currentVersion,
      dryRun,
      json,
      packages,
      drifted,
    })
    return
  }

  for (const entry of drifted) {
    writeStderr(
      `[version] ${relative(entry.file)} was at ${entry.pkg.version}; bringing it to the release version.`,
    )
  }

  let nextVersion
  if (command === 'set') {
    const [explicit] = positional
    if (!explicit)
      throw new Error('`set` requires a target version, e.g. `vpr version:set -- 2.1.0-beta.0`.')
    parseVersion(explicit)
    nextVersion = explicit
  } else {
    const parsed = parseVersion(currentVersion)
    nextVersion = formatVersion(bump(parsed, command, preid))
  }

  if (!dryRun) await writePackages(packages, nextVersion)

  printResult({ command, currentVersion, nextVersion, dryRun, json, packages, drifted })
}

main().catch((error) => {
  writeStderr(`[version] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
