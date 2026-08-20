import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(__dirname, '../../package.json')

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

async function readPackageJson() {
  const content = await readFile(packageJsonPath, 'utf8')
  return JSON.parse(content)
}

async function writePackageJson(pkg) {
  const next = `${JSON.stringify(pkg, null, 2)}\n`
  await writeFile(packageJsonPath, next, 'utf8')
}

function writeStdout(message) {
  process.stdout.write(`${message}\n`)
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`)
}

function printResult({ command, currentVersion, nextVersion, dryRun, json }) {
  if (json) {
    writeStdout(
      JSON.stringify(
        {
          command,
          currentVersion,
          nextVersion,
          dryRun,
        },
        null,
        2,
      ),
    )
    return
  }

  if (command === 'show') {
    writeStdout(currentVersion)
    return
  }

  const action = dryRun ? 'Would set' : 'Set'
  writeStdout(`${action} version ${currentVersion} -> ${nextVersion}`)
}

async function main() {
  const { command, preid, dryRun, json, positional } = parseArgs(process.argv.slice(2))
  const pkg = await readPackageJson()
  const currentVersion = String(pkg.version)

  if (command === 'show') {
    printResult({ command, currentVersion, nextVersion: currentVersion, dryRun, json })
    return
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

  if (!dryRun) {
    pkg.version = nextVersion
    await writePackageJson(pkg)
  }

  printResult({ command, currentVersion, nextVersion, dryRun, json })
}

main().catch((error) => {
  writeStderr(`[version] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
