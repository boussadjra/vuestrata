import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { API_WIRING_STEPS, isApiWired } from '../lib/api-wiring.mjs'
import { AUTH_WIRING_STEPS, isAuthConfigWired } from '../lib/auth-wiring.mjs'
import { logger } from '../lib/cli.mjs'
import {
  DEPLOY_CONFIG_READERS,
  deployWiringSteps,
  dockerfileWithoutRuntimeConfig,
  readsDeployConfig,
} from '../lib/deploy-wiring.mjs'
import { driftedFiles, LOCKFILE_NAME, readLock, regionHash } from '../lib/lockfile.mjs'
import { PROJECT_REGISTRIES, SEEDED_FILES } from '../lib/managed.mjs'
import {
  describeMissingSlot,
  loadManifest,
  MANIFEST_FILENAME,
  missingSlots,
  slot,
  slotPath,
} from '../lib/manifest.mjs'
import { compareVersions } from '../lib/migrations.mjs'
import { createPayloadSource } from '../lib/payload.mjs'
import { isRbacWired, RBAC_WIRING_STEPS } from '../lib/rbac-wiring.mjs'
import {
  ANCHORED_REGISTRIES,
  hasSentinel,
  regionEntries,
  regionLines,
  sentinel,
  UPSTREAM_SCOPE,
} from '../lib/registry.mjs'
import { incomingPath } from '../lib/workspace.mjs'
import { planUpgrade } from './upgrade.mjs'

/**
 * Can this project still be upgraded, and what will an upgrade have to work
 * around?
 *
 * Everything here is knowable before an upgrade rather than during one, which
 * is the point: an upgrade that discovers halfway through that a registry lost
 * its anchors has already written half a release.
 */

export function runDoctor({ root, version, flags, source = createPayloadSource(), migrations }) {
  let findings
  try {
    findings = diagnose({ root, version, source, migrations })
  } catch (error) {
    logger.error(error.message)
    process.exit(1)
  }

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ ok: findings.errors.length === 0, ...findings }, null, 2)}\n`,
    )
    process.exit(findings.errors.length === 0 ? 0 : 1)
  }

  for (const note of findings.notes) logger.log(`  · ${String(note)}`)
  for (const warning of findings.warnings) logger.warn(warning)
  for (const error of findings.errors) logger.error(error)

  logger.log('')
  if (findings.errors.length > 0) {
    logger.error(`${findings.errors.length} problem(s) would stop an upgrade.`)
    process.exit(1)
  }
  logger.success(
    findings.warnings.length > 0
      ? `Upgradable, with ${findings.warnings.length} thing(s) an upgrade will skip.`
      : 'Everything an upgrade needs is in place.',
  )
}

/**
 * The findings, without printing or exiting. Throws only when the manifest
 * itself cannot be read.
 *
 * With a payload, it also plans the upgrade to that release (writing nothing),
 * so what it says the upgrade will do is what the upgrade does.
 */
export function diagnose({ root, version, source, migrations }) {
  const findings = { errors: [], warnings: [], notes: [] }
  const manifest = loadManifest(root)

  findings.notes.push(
    manifest.present
      ? `${MANIFEST_FILENAME} found; slots resolved from it.`
      : `No ${MANIFEST_FILENAME}; using the default layout. That is correct until you move something.`,
  )

  // ── 1. Do the slots resolve? ─────────────────────────────────────────────
  for (const entry of missingSlots(manifest)) {
    findings.errors.push(describeMissingSlot(entry))
  }

  // ── 2. Do the registries still carry their anchors? ──────────────────────
  for (const target of ANCHORED_REGISTRIES) {
    const full = slotPath(manifest, target.slot)
    if (!fs.existsSync(full)) continue // already reported above

    const contents = fs.readFileSync(full, 'utf8')
    const rel = slot(manifest, target.slot)

    for (const scope of target.upstream === false ? ['app'] : [UPSTREAM_SCOPE, 'app']) {
      const name = sentinel(target.region, scope)
      if (hasSentinel(contents, name, { comment: target.comment })) continue
      findings.warnings.push(
        `${rel} has no "${name}" region. ` +
          (scope === UPSTREAM_SCOPE
            ? 'An upgrade cannot add entries here and will skip it.'
            : 'Generators cannot add entries here.'),
      )
    }
  }

  // ── 3. What has been edited since it was written? ────────────────────────
  const lockExists = fs.existsSync(path.join(root, LOCKFILE_NAME))
  const lock = readLock(root, { version })

  if (!lockExists) {
    findings.warnings.push(
      `No ${LOCKFILE_NAME}. Nothing is tracked yet, so an upgrade cannot tell your edits ` +
        'from untouched files. Run `vuestrata init` to start tracking.',
    )
    for (const unwired of [
      unwiredRbacOverrides({ root, manifest }),
      unwiredApiOverrides({ root, manifest }),
      unwiredAuthConfig({ root, manifest }),
    ]) {
      if (unwired) findings.warnings.push(unwired)
    }
    findings.warnings.push(...unreadDeployConfig({ root, manifest }))
    findings.warnings.push(...dockerfileWarnings(root))
    return findings
  }

  findings.notes.push(
    `Tracking ${Object.keys(lock.files).length} file(s) from template ${lock.template ?? 'unknown'}` +
      (lock.ejected.length ? `, ${lock.ejected.length} ejected` : '') +
      '.',
  )

  // A plan from an older CLI would describe a downgrade, so none is made.
  const behind = source && compareVersions(lock.template ?? '0.0.0', source.version) > 0
  if (behind) {
    findings.warnings.push(
      `This project is at ${lock.template}, newer than the ${source.version} this CLI ships. ` +
        `\`upgrade\` refuses to move backwards; run the CLI for ${lock.template} or later.`,
    )
  }

  const plan =
    source && !behind
      ? planFor({ root, version, source, migrations, manifest, findings })
      : undefined
  for (const entry of plan?.blockers ?? []) {
    findings.errors.push(`${entry.rel}: ${entry.text}`)
  }
  const reclassified = new Set(
    (plan?.adopted ?? [])
      .filter((entry) => entry.reason === 'reclassified')
      .map((entry) => entry.rel),
  )

  for (const entry of driftedFiles(root, lock)) {
    if (reclassified.has(entry.rel)) {
      findings.notes.push(
        `${entry.rel} becomes a merged file, and it only differs inside its app: regions, so the ` +
          'next upgrade records it as merged and keeps your entries.',
      )
      continue
    }

    findings.notes.push(
      entry.status === 'deleted'
        ? `${entry.rel} is tracked but missing. An upgrade will skip it rather than restore it.`
        : entry.record.class === 'merged'
          ? `${entry.rel} was edited outside its app: regions. An upgrade will leave it alone and ` +
            'write the new version, with your app: entries in it, to .vuestrata/incoming/ to ' +
            'compare against.'
          : `${entry.rel} was edited after Vuestrata wrote it. An upgrade will leave it alone and ` +
            'write the new version to .vuestrata/incoming/ to compare against.',
    )
  }

  // ── 4. Are the seams still there? ────────────────────────────────────────
  // Managed code imports them statically, so a missing seam is a build that
  // fails — and a tracked one is the project's, which an upgrade never
  // rewrites.
  const seams = source?.format === 2 ? Object.keys(source.seeded) : SEEDED_FILES
  for (const rel of seams) {
    if (lock.ejected.includes(rel) || fs.existsSync(path.join(root, rel))) continue

    if (lock.files[rel]) {
      findings.errors.push(
        `${rel} is missing. Vuestrata's own code imports it, so the build fails without it, and ` +
          `an upgrade never rewrites a file that is yours. Restore it (\`git checkout -- ${rel}\`), ` +
          `or delete its entry from ${LOCKFILE_NAME} and run \`vuestrata upgrade\` to get the default.`,
      )
    } else {
      findings.notes.push(`${rel} is not here yet; the next \`vuestrata upgrade\` writes it.`)
    }
  }

  // ── 5. What is shipped but not yet tracked? ──────────────────────────────
  for (const entry of plan?.adopted ?? []) {
    if (entry.reason !== 'promoted') continue
    findings.notes.push(
      `${entry.rel} is maintained by Vuestrata from ${plan.to}. It matches a release that shipped ` +
        'it, so the next upgrade adopts it and keeps it updated.',
    )
  }

  for (const entry of plan?.incoming ?? []) {
    if (entry.shipped !== undefined) {
      // `adopt` cannot help at this path: the lock tracks a managed file where it ships.
      findings.warnings.push(
        `${entry.rel} is maintained by Vuestrata from ${plan.to} (${entry.reason}), and upgrades ` +
          'only take over a file where it ships. The next upgrade leaves yours alone, writes ' +
          `this release's version to ${incomingPath(entry.rel)} to compare against, and records ` +
          `${entry.shipped} as ejected so no second copy is installed there; later releases will ` +
          `not offer it again. To hand it over instead, move it back to ${entry.shipped} and ` +
          'update vuestrata.config.json to match before you upgrade.',
      )
      continue
    }

    if (entry.reason !== 'promoted' && entry.reason !== 'untracked') continue
    findings.warnings.push(
      `${entry.rel} is shipped by Vuestrata but not tracked here, and differs from ${plan.to} ` +
        `(pending adoption). An upgrade leaves it alone and writes the new version to ` +
        `${incomingPath(entry.rel)}; merge what you want, then run \`vuestrata adopt ${entry.rel}\`.`,
    )
  }

  // ── 6. Are the seams wired in? ───────────────────────────────────────────
  // rbac.overrides.ts is installed by state/runtime-backends.ts and
  // api.overrides.ts by bootstrap/seams.ts. An upgrade that replaces the
  // installing file settles it, so only a copy that will stay as it is is
  // worth a warning.
  const willBeReplaced = (rel) =>
    (plan?.adopted ?? []).some((entry) => entry.rel === rel) ||
    (lock.files[rel]?.class === 'managed' &&
      !driftedFiles(root, lock).some((entry) => entry.rel === rel))

  const unwiredRbac = willBeReplaced(runtimeBackendsFile(manifest))
    ? undefined
    : unwiredRbacOverrides({ root, manifest })
  if (unwiredRbac) findings.warnings.push(unwiredRbac)

  const unwiredApi = willBeReplaced(seamsFile(manifest))
    ? undefined
    : unwiredApiOverrides({ root, manifest })
  if (unwiredApi) findings.warnings.push(unwiredApi)

  // ── 6b. Is deploy.config.ts read by the tooling that acts on it? ─────────
  // The same reasoning: a script the upgrade replaces is about to read it.
  const drifted = new Set(driftedFiles(root, lock).map((entry) => entry.rel))
  const willBeCurrent = (rel) =>
    (plan?.adopted ?? []).some((entry) => entry.rel === rel) ||
    (lock.files[rel]?.class === 'managed' && !drifted.has(rel))
  findings.warnings.push(...unreadDeployConfig({ root, manifest, skip: willBeCurrent }))
  findings.warnings.push(...dockerfileWarnings(root))

  // ── 6b. Is auth.config.ts wired in? ──────────────────────────────────────
  // The same question for the auth seam, which bootstrap/seams.ts installs.
  const unwiredAuth = willBeReplaced(seamsFile(manifest))
    ? undefined
    : unwiredAuthConfig({ root, manifest })
  if (unwiredAuth) findings.warnings.push(unwiredAuth)

  // ── 7. Which vuestrata: regions were edited? ─────────────────────────────
  for (const registry of PROJECT_REGISTRIES) {
    const rel = slot(manifest, registry.slot)
    const name = sentinel(registry.region, UPSTREAM_SCOPE)
    const recorded = lock.regions[rel]?.[name]
    const full = path.join(root, rel)
    if (recorded === undefined || !fs.existsSync(full)) continue

    const lines = regionLines(fs.readFileSync(full, 'utf8'), name)
    if (lines === undefined) continue // reported in section 2

    if (regionHash(regionEntries(lines, { keyedBy: registry.keyedBy })) === recorded) continue
    findings.notes.push(
      `${name} in ${rel} was edited since the last upgrade. Upgrades will not append to it ` +
        `until you run \`vuestrata adopt ${rel}\`.`,
    )
  }

  return findings
}

const runtimeBackendsFile = (manifest) => `${slot(manifest, 'appDir')}/state/runtime-backends.ts`
const seamsFile = (manifest) => `${slot(manifest, 'appDir')}/bootstrap/seams.ts`

/**
 * A warning when the project has an `rbac.overrides.ts` that nothing installs.
 *
 * `state/runtime-backends.ts` is what hands the seam to core/lib. A copy from
 * before the seam existed does not, so what the project declares, grants and
 * withdraws there has no effect — and nothing fails to say so.
 */
function unwiredRbacOverrides({ root, manifest }) {
  const overrides = slot(manifest, 'rbacOverrides')
  const backends = runtimeBackendsFile(manifest)
  if (!fs.existsSync(path.join(root, overrides)) || !fs.existsSync(path.join(root, backends))) {
    return undefined
  }

  const source = fs.readFileSync(path.join(root, backends), 'utf8')
  if (isRbacWired(source)) return undefined

  return (
    `${overrides} exists, but ${backends} does not install it, so the permissions you declare, ` +
    'grant and withdraw there have no effect. ' +
    RBAC_WIRING_STEPS
  )
}

/**
 * A warning when the project has an `api.overrides.ts` that nothing installs.
 *
 * `bootstrap/seams.ts` is what hands the seam to core/lib. A copy from before
 * the seam existed is an empty function, so the preset, headers, error mappers
 * and CSRF strategy the project sets there have no effect: the API client
 * falls back to its defaults, and nothing fails to say so.
 */
function unwiredApiOverrides({ root, manifest }) {
  const overrides = slot(manifest, 'apiOverrides')
  const seams = seamsFile(manifest)
  if (!fs.existsSync(path.join(root, overrides)) || !fs.existsSync(path.join(root, seams))) {
    return undefined
  }

  const source = fs.readFileSync(path.join(root, seams), 'utf8')
  if (isApiWired(source)) return undefined

  return (
    `${overrides} exists, but ${seams} does not install it, so the backend conventions you ` +
    'describe there (a preset, headers, error mappers, a CSRF strategy) have no effect. ' +
    API_WIRING_STEPS
  )
}

/**
 * A warning for each script that should read the project's `deploy.config.ts`
 * and is a copy that does not.
 *
 * The Vite plugin, the header generator and the bundle check are what give the
 * file its effect. A copy from before it existed ignores it, so the variables,
 * runtime keys, header sources and budgets declared there do nothing — and
 * nothing fails to say so.
 * `skip` names the copies an upgrade is about to replace.
 */
function unreadDeployConfig({ root, manifest, skip = () => false }) {
  const config = slot(manifest, 'deployConfig')
  if (!fs.existsSync(path.join(root, config))) return []

  return DEPLOY_CONFIG_READERS.filter(({ file }) => {
    const full = path.join(root, file)
    if (!fs.existsSync(full) || skip(file)) return false
    return !readsDeployConfig(fs.readFileSync(full, 'utf8'))
  }).map(
    ({ file, consequence }) =>
      `${config} exists, but ${file} does not read it, so ${consequence}. ` +
      deployWiringSteps(file, incomingPath(file)),
  )
}

/** What is wrong with the project's Dockerfile, when it has one. It is the project's file. */
function dockerfileWarnings(root) {
  const full = path.join(root, 'Dockerfile')
  if (!fs.existsSync(full)) return []
  const warning = dockerfileWithoutRuntimeConfig(fs.readFileSync(full, 'utf8'))
  return warning ? [warning] : []
}

/**
 * A warning when the project has an `auth.config.ts` that nothing installs.
 *
 * `bootstrap/seams.ts` is what hands the seam to the auth module. A copy from
 * before the seam existed does not, so the endpoints, mappers, providers and
 * adapters the project configures there have no effect — and nothing fails to
 * say so.
 */
function unwiredAuthConfig({ root, manifest }) {
  const config = slot(manifest, 'authConfig')
  const seams = seamsFile(manifest)
  if (!fs.existsSync(path.join(root, config)) || !fs.existsSync(path.join(root, seams))) {
    return undefined
  }

  if (isAuthConfigWired(fs.readFileSync(path.join(root, seams), 'utf8'))) return undefined

  return (
    `${config} exists, but ${seams} does not install it, so the endpoints, response mappers, ` +
    'providers and adapters you configure there have no effect. ' +
    AUTH_WIRING_STEPS
  )
}

/** The upgrade report, or `undefined` (and an error finding) if it cannot be planned. */
function planFor({ root, version, source, migrations, manifest, findings }) {
  try {
    return planUpgrade({ root, version, source, migrations, manifest }).report
  } catch (error) {
    findings.errors.push(`An upgrade to ${source.version} could not be planned: ${error.message}`)
    return undefined
  }
}
