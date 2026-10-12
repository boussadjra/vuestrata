import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashFor, LOCKFILE_NAME } from '../../src/lib/lockfile.mjs'
import { DEFAULT_SLOTS, slot } from '../../src/lib/manifest.mjs'
import { hashContents } from '../../src/lib/plan.mjs'
import {
  hasSentinel,
  insertBeforeSentinel,
  SENTINELS,
  spliceRegions,
} from '../../src/lib/registry.mjs'
import { incomingPath } from '../../src/lib/workspace.mjs'
import { inEolOf, listOf, toLf } from './text.mjs'

/**
 * A project that ran `vuestrata eject` on 1.0.
 *
 * The 1.0 `eject` retired the permissions of the modules it removed by editing
 * two files in core/lib/rbac/: it struck their literals from the union in
 * types.ts and their grants from inheritance.ts. Both files are Vuestrata's, so
 * an upgrade finds them edited and keeps them, and this release does not
 * compile beside a 1.0 types.ts: its rbac barrel and overrides.ts import
 * `AppPermissions` and `RbacOverrides` from it. An ejected project is the
 * ordinary project, and it was the tool that made those edits, not a person.
 *
 * So this step undoes exactly them. When the two files differ from what 1.0
 * shipped by nothing but what that `eject` removes, it puts the 1.0 text back,
 * which the lock records as clean, and the sync that follows installs this
 * release's files like any other untouched file. The permissions go where 1.1.0
 * keeps a withdrawal: the `app:withdrawn` region of rbac.overrides.ts. The
 * project ends with the permission set it had.
 *
 * "Nothing but" is decided by doing it again: the 1.0 transformation, copied
 * below from that release's eject.mjs, is applied to the 1.0 files with the
 * literals the project's union lacks, and the result has to be the project's
 * files. They are compared as the formatter leaves them, because `eject` wrote
 * `delta: ['users:read', 'settings:read', ],` and an array with nothing in it
 * over two lines, and the first commit reformatted both.
 *
 * Any other difference is somebody's work. The files stay, and one note says
 * what that costs and what to do (`heldBackNote`).
 *
 * The 1.0 files are in `released-1.0/`, with `.txt` added so that no formatter,
 * linter or build reads them as source. 1.0.1-alpha.5 and 1.0.1-alpha.6 agree
 * on both, and test/unit/cli/rbac-eject-1.1.0.test.ts checks the copies against
 * the tags.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

/** A file as 1.0.1-alpha.5 and 1.0.1-alpha.6 shipped it, in LF. */
const released10 = (name) =>
  toLf(fs.readFileSync(path.join(here, 'released-1.0', `${name}.txt`), 'utf8'))

/**
 * What types.ts hashed to at 1.0.1-alpha.5 and 1.0.1-alpha.6. The whole-file
 * hash and the merged one agree, because its `app:` region shipped empty.
 */
export const PERMISSIONS_PRISTINE = [
  'sha256-9cea2c7654c28bf669b8c0ff69585c7f7c6f1651f73684dfc325c6500e6cc9ac',
]

// ─── What the 1.0 `eject` did ────────────────────────────────────────────────

/** A member of the permission union, on a line of its own. */
const UNION_MEMBER = /^\s*\|\s*'([^']+)'\s*$/

const unionLiterals = (text) =>
  text
    .split('\n')
    .map((line) => UNION_MEMBER.exec(line)?.[1])
    .filter(Boolean)

/**
 * The names in `export type Role = …`, on one line as 1.0 shipped it or one
 * member to a line as the formatter writes it once it no longer fits.
 */
function roleNames(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^export\s+type\s+Role\s*=/.test(line))
  if (start === -1) return []

  const union = [lines[start]]
  for (let i = start + 1; i < lines.length && UNION_MEMBER.test(lines[i]); i++) union.push(lines[i])
  return [...union.join(' ').matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/** `unwirePermissions` of 1.0.1-alpha.6, the half that edits the union. */
function strikeFromUnion(text, literals) {
  return text
    .split('\n')
    .filter((line) => {
      const match = UNION_MEMBER.exec(line)
      return !match || !literals.has(match[1])
    })
    .join('\n')
}

/** `unwirePermissions` of 1.0.1-alpha.6, the half that edits the grants. */
function strikeFromGrants(text, literals) {
  return text
    .split('\n')
    .filter((line) => {
      const match = /^\s*'([^']+)',?\s*$/.exec(line)
      return !match || !literals.has(match[1])
    })
    .map((line) =>
      line.includes('delta:')
        ? line.replace(/'([^']+)',?\s*/g, (whole, literal) => (literals.has(literal) ? '' : whole))
        : line,
    )
    .join('\n')
}

// ─── Comparing past the formatter ────────────────────────────────────────────

const trimLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

/**
 * A `delta: [...]` array on one line, whatever lines it was written over. Only
 * an array that holds nothing but quoted literals: one with a comment in it is
 * left as it is, and so compares unequal, and so is somebody's work.
 */
const flattenDeltas = (text) =>
  text.replace(/delta:\s*\[((?:\s*'[^']+'\s*,?)*)\s*\]/g, (whole, body) => {
    const literals = [...body.matchAll(/'([^']+)'/g)].map((match) => `'${match[1]}'`)
    return `delta: [${literals.join(', ')}]`
  })

/** Indentation is the formatter's: it moves a comment that loses the member below it. */
const sameUnion = (a, b) => trimLines(a) === trimLines(b)
const sameGrants = (a, b) => trimLines(flattenDeltas(a)) === trimLines(flattenDeltas(b))

// ─── Recognising it ──────────────────────────────────────────────────────────

/** The lock on disk: what the project is coming from. An upgrade writes it last. */
function lockOnDisk(ws) {
  try {
    return JSON.parse(ws.read(LOCKFILE_NAME))
  } catch {
    return undefined
  }
}

const rbacFiles = (manifest) => ({
  union: slot(manifest, 'permissions'),
  grants: slot(manifest, 'rbacInheritance'),
  overrides: slot(manifest, 'rbacOverrides'),
})

/**
 * What the upgrade will find in the permission union: `clean` when it is what
 * the lock recorded or a release shipped, `held` when the reclassify step is
 * going to leave it (the same test, on the same record), `untracked` otherwise.
 */
function unionState(ws, manifest) {
  const { union } = rbacFiles(manifest)
  const record = lockOnDisk(ws)?.files?.[union]
  if (record?.class !== 'managed' || !ws.exists(union)) return 'untracked'

  const source = ws.read(union)
  return hashFor(union, source, 'managed') === record.hash ||
    PERMISSIONS_PRISTINE.includes(hashFor(union, source, 'merged'))
    ? 'clean'
    : 'held'
}

/**
 * The two files against what 1.0 shipped.
 *
 * `removed` is what the project's union lacks, `added` what it holds outside
 * its `app:` region that 1.0 did not ship. `ejected` holds when the pair is
 * exactly what the 1.0 `eject` makes of the 1.0 files for `removed`, and then
 * `union` and `grants` are the texts to put back: the 1.0 files, the union with
 * the project's own `app:` entries in it.
 */
function compareWith10(ws, manifest) {
  const files = rbacFiles(manifest)
  if (!ws.exists(files.union) || !ws.exists(files.grants)) return undefined

  const union = toLf(ws.read(files.union))
  const grants = toLf(ws.read(files.grants))

  // The 1.0 union with the project's own entries, which `add module` wrote
  // into the app: region and `eject` left there.
  const union10 = spliceRegions(released10('rbac-types.ts'), union).contents
  const grants10 = released10('rbac-inheritance.ts')

  // A `Role` union the formatter wrapped is written like the permission union,
  // one member to a line: its names are roles, not permissions the project added.
  const roles = roleNames(union)
  const roles10 = new Set(roleNames(released10('rbac-types.ts')))
  const addedRoles = roles.filter((name) => !roles10.has(name))

  const shipped = unionLiterals(released10('rbac-types.ts'))
  const held = new Set(unionLiterals(union).filter((literal) => !roles.includes(literal)))
  const removed = shipped.filter((literal) => !held.has(literal))
  const known = new Set(unionLiterals(union10))
  const added = [...held].filter((literal) => !known.has(literal))

  const struck = new Set(removed)
  const ejected =
    removed.length > 0 &&
    sameUnion(strikeFromUnion(union10, struck), union) &&
    sameGrants(strikeFromGrants(grants10, struck), grants)

  return { files, removed, added, addedRoles, ejected, union: union10, grants: grants10 }
}

/**
 * The upgrade can take the two files back: they are in the 1.0-eject shape, the
 * lock holds them as the 1.0 release wrote them (so the restored text is clean,
 * and the sync replaces it), and there is somewhere to write the withdrawals.
 */
function restorable(ws, manifest, release) {
  const found = compareWith10(ws, manifest)
  if (!found?.ejected) return undefined

  const { files } = found
  const lock = lockOnDisk(ws)
  const unionRecord = lock?.files?.[files.union]
  const grantsRecord = lock?.files?.[files.grants]

  if (unionRecord?.class !== 'managed' || grantsRecord?.class !== 'managed') return undefined
  if (grantsRecord.hash !== hashContents(found.grants)) return undefined
  if (
    unionRecord.hash !== hashFor(files.union, found.union, 'managed') &&
    !PERMISSIONS_PRISTINE.includes(hashFor(files.union, found.union, 'merged'))
  ) {
    return undefined
  }

  // The withdrawals go into the project's rbac.overrides.ts: the one it has,
  // or the one this release seeds, which the sync then records as its own.
  const shipped = DEFAULT_SLOTS.rbacOverrides
  const overrides = ws.exists(files.overrides)
    ? ws.read(files.overrides)
    : release?.has?.(shipped)
      ? release.read(shipped)
      : undefined
  if (overrides === undefined || !hasSentinel(overrides, SENTINELS.withdrawn)) return undefined

  return { ...found, overrides }
}

const takeBackEjectedRbac = {
  slot: 'permissions',
  pending: (source, manifest, ws, release) => restorable(ws, manifest, release) !== undefined,
  apply: (source, manifest, ws, release) => {
    const found = restorable(ws, manifest, release)
    if (!found) return source

    const { files } = found
    const withdrawn = found.removed.toSorted((a, b) => a.localeCompare(b))

    ws.write(
      files.overrides,
      withdrawn.reduce(
        (text, literal) => insertBeforeSentinel(text, SENTINELS.withdrawn, `'${literal}',`),
        found.overrides,
      ),
    )
    ws.write(files.grants, inEolOf(ws.read(files.grants), found.grants))

    return inEolOf(source, found.union)
  },
}

// ─── When it cannot ──────────────────────────────────────────────────────────

/**
 * The permission union is being left at 1.0, which nothing else in the upgrade
 * survives: said once, here, in place of the reclassify step's own note.
 *
 * It runs after the step above, so a project that step took back is silent.
 */
function heldBackNote(source, manifest, ws) {
  if (unionState(ws, manifest) !== 'held') return undefined

  const {
    files,
    removed = [],
    added = [],
    addedRoles = [],
  } = compareWith10(ws, manifest) ?? {
    files: rbacFiles(manifest),
  }
  const quoted = (literals) => listOf(literals.map((literal) => `'${literal}'`))

  const steps = [
    `take ${incomingPath(files.union)} and ${incomingPath(files.grants)} whole, over your copies ` +
      `(permissions and roles are no longer edited in core/lib/rbac/: a grant you made there ` +
      `goes under \`grants\` in ${files.overrides})`,
  ]
  if (addedRoles.length > 0) {
    steps.push(
      `declare the roles you added to \`Role\` in \`AppRoles\` in ${files.overrides}, and define ` +
        'each under `roles` there, with the roles it holds the permissions of in `inherits` ' +
        '(for a role you placed in ROLE_HIERARCHY, the role that came right after it) and what ' +
        `you gave it in ROLE_DELTA_DEFINITIONS under \`grants\`: ${quoted(addedRoles)}. No ` +
        'built-in role inherits from a role of yours, so one you had placed above a built-in ' +
        'role is no longer held by the roles above it',
    )
  }
  if (removed.length > 0) {
    steps.push(
      `list the built-in permissions your union no longer has under \`withdrawn\` in ` +
        `${files.overrides}, which is what \`vuestrata eject\` on 1.0 did by removing them: ` +
        `${quoted(removed)}`,
    )
  }
  if (added.length > 0) {
    steps.push(
      `declare the permissions you added to the union under \`permissions\` in ` +
        `${files.overrides}, and give them to a role under \`grants\`: ${quoted(added)}`,
    )
  }
  if (removed.length === 0 && added.length === 0 && addedRoles.length === 0) {
    steps.push(
      `move what you changed into ${files.overrides}: permissions of your own under ` +
        '`permissions` and `grants`, built-in ones you do not use under `withdrawn`, roles of ' +
        'your own under `roles`',
    )
  }
  steps.push(`run \`vuestrata adopt ${files.union} ${files.grants}\``)

  return (
    `THE PROJECT WILL NOT TYPE-CHECK UNTIL THIS IS DONE. ${files.union} differs from every ` +
    'release that shipped it, so it was left alone, and this release does not compile beside ' +
    'a 1.0 copy of it: core/lib/rbac/index.ts and overrides.ts import `AppPermissions` and ' +
    '`RbacOverrides` from it, so `vp check` and `vpr build` fail in files you never touched. ' +
    'The upgrade takes these two files back by itself only when they differ from 1.0 by ' +
    'exactly what `vuestrata eject` removed, and yours differ in some other way too. To ' +
    `finish: ${steps.map((step, index) => `(${index + 1}) ${step}`).join('; ')}. ` +
    '"If you ran eject on 1.0" in UPGRADING.md has the same steps with an example.'
  )
}

export default {
  description:
    'permissions the 1.0 eject struck from core/lib/rbac/ are withdrawn in rbac.overrides.ts',
  steps: [
    takeBackEjectedRbac,
    {
      kind: 'note',
      slot: 'permissions',
      note: heldBackNote,
    },
  ],
}
