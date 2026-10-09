import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { hasTags, released, REPO } from './release-tags'

/**
 * A file the project kept, beside the files this release replaced.
 *
 * A file that became managed in 1.1.0 keeps its path, and a project that edited
 * it keeps its copy: the 1.0 file, with the project's changes. Everything else
 * Vuestrata manages is replaced around it. So for one minor, managed code must
 * compile and run against the 1.0 version of every promoted file (RELEASE.md,
 * "Writing a migration"), and nothing but a project's build used to check it:
 *
 *   - `useAuth.ts` called `clearAuth(reason)` on a kept auth store whose
 *     `clearAuth()` takes no argument;
 *   - `jwt.ts` called `authEndpoints.refreshWithToken()` and `.getUserAs()` on
 *     a kept `base.ts` that has neither: a type error in a file the project
 *     never touched, and a TypeError on every token refresh.
 *
 * This is that build, for every promoted file. Each is put back to what
 * 1.0.1-alpha.6 shipped, alone, or together with the files it is promoted as a
 * unit with, and the managed files that read it are type-checked against it,
 * with Vue's own checker, so templates count too. A finding is fixed in one of
 * two ways: the managed file reads the new member through a type the old file
 * also satisfies (see `AuthWiringStore`), or the files are promoted as a unit
 * (`ADAPTER_UNIT_FILES`), so that one cannot be kept without the other.
 *
 * Maintainers only, and only with the release tags: it reads the 1.0 files from
 * them, and it takes a minute or two. Without the generated typings (a checkout
 * that never ran `vp dev` or `vp build`) it still runs, comparing against the
 * same check of this release's files, so only what the kept file changes is
 * reported. Names that reach a file through auto-imports are unresolved either
 * way there, which leaves `useRbac` checked only where it is imported by path.
 */

const { ADAPTER_UNIT_FILES } = await loadCli('migrations/1.1.0/promotions.mjs')
const { classify } = await loadCli('src/lib/managed.mjs')
const { collectMigrationsAsync } = await loadCli('src/lib/migrations.mjs')

// One program for the whole repository, then one more per case.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })

const posix = (file: string) => file.replaceAll('\\', '/')
const ROOT = posix(path.resolve(REPO))
const inRoot = (rel: string) => `${ROOT}/${rel}`

interface Diagnostic {
  file: string
  code: string
  message: string
}

interface Step {
  kind?: string
  file?: string
  unit?: string
}

/** A promoted file, or the files promoted as one unit. */
interface Kept {
  name: string
  files: string[]
}

/** Files the type checker reads: `.mjs` scripts and stylesheets are not among them. */
const isChecked = (rel: string) => /\.(ts|vue|json)$/.test(rel) && rel.startsWith('src/')

/**
 * The type checker `vpr build` runs (`vue-tsc`), in process and over a host
 * that can serve a file's 1.0 contents in place of what is on disk. Nothing is
 * written anywhere, and a case costs the files it checks, not the repository.
 */
function createChecker() {
  // vue-tsc's own dependencies, so the versions are the ones `vpr build` uses.
  const require = createRequire(path.join(REPO, 'node_modules/vue-tsc/index.js'))
  const ts = require('typescript')
  const { proxyCreateProgram } = require('@volar/typescript')
  const vue = require('@vue/language-core')

  const configPath = inRoot('tsconfig.json')
  const { vueOptions } = vue.createParsedCommandLine(ts, ts.sys, configPath)
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
    undefined,
    undefined,
    vue.getAllExtensions(vueOptions).map((extension: string) => ({
      extension: extension.slice(1),
      isMixedContent: true,
      scriptKind: ts.ScriptKind.Deferred,
    })),
  )

  // The project's tests are its own, and still the ones 1.0 shipped: they are
  // not part of what an upgrade replaces around a kept file.
  const rootNames: string[] = parsed.fileNames.filter(
    (file: string) => !posix(file).startsWith(inRoot('test/')),
  )
  const options = { ...parsed.options, noEmit: true }

  const key = (file: string) => posix(path.resolve(file)).toLowerCase()
  const overlay = new Map<string, string>()
  const parsedFiles = new Map<string, unknown>()

  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  host.readFile = (file: string) => overlay.get(key(file)) ?? readFile(file)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file: string, ...rest: unknown[]) => {
    const id = key(file)
    if (!parsedFiles.has(id)) parsedFiles.set(id, getSourceFile(file, ...rest))
    return parsedFiles.get(id)
  }

  const createProgram = proxyCreateProgram(
    ts,
    ts.createProgram,
    (_ts: unknown, created: { options: unknown }) => ({
      languagePlugins: [
        vue.createVueLanguagePlugin(ts, created.options, vueOptions, (id: string) => id),
      ],
    }),
  )

  const current = createProgram({ rootNames, options, host })

  function diagnose(program: typeof current, rels: string[]): Diagnostic[] {
    return rels.flatMap((rel) => {
      const sourceFile = program.getSourceFile(inRoot(rel))
      if (!sourceFile) return [{ file: rel, code: 'missing', message: 'not in the program' }]

      return program
        .getSemanticDiagnostics(sourceFile)
        .map((diagnostic: { code: number; messageText: unknown }): Diagnostic => ({
          file: rel,
          code: `TS${diagnostic.code}`,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        }))
    })
  }

  /** The source files under `src/`, as repository-relative paths. */
  const sources: string[] = current
    .getSourceFiles()
    .map((sourceFile: { fileName: string }) => posix(sourceFile.fileName))
    .filter((file: string) => file.startsWith(inRoot('src/')))
    .map((file: string) => file.slice(ROOT.length + 1))

  const resolve = (specifier: string, from: string): string | undefined => {
    const found = ts.resolveModuleName(specifier, inRoot(from), options, host).resolvedModule
    const file = found && posix(found.resolvedFileName)
    return file?.startsWith(`${ROOT}/`) ? file.slice(ROOT.length + 1) : undefined
  }

  return {
    sources,
    resolve,
    /** What `rels` report in this release, as it is on disk. */
    baseline: (rels: string[]) => diagnose(current, rels),
    /** What `rels` report with each file of `kept` put back to its 1.0 contents. */
    withKept(kept: Record<string, string>, rels: string[]): Diagnostic[] {
      for (const [rel, contents] of Object.entries(kept)) {
        overlay.set(key(inRoot(rel)), contents)
        parsedFiles.delete(key(inRoot(rel)))
      }
      try {
        return diagnose(createProgram({ rootNames, options, host, oldProgram: current }), rels)
      } finally {
        for (const rel of Object.keys(kept)) {
          overlay.delete(key(inRoot(rel)))
          parsedFiles.delete(key(inRoot(rel)))
        }
      }
    },
  }
}

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
const RE_EXPORT =
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g
/** What `unplugin-auto-import` scans (vite.config.ts): the composables named `use*.ts`. */
const AUTO_IMPORTED = /^src\/modules\/app\/composables\/(?:.*\/)?use[^/]*\.ts$/
const EXPORTED_NAME = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([\w$]+)/gm

type Checker = ReturnType<typeof createChecker>

/** Which source files import which, resolved the way the type checker resolves them. */
function importGraph(checker: Checker) {
  const texts = new Map<string, string>()
  const imports = new Map<string, Set<string>>()
  const reExports = new Map<string, Set<string>>()

  const resolved = (rel: string, text: string, pattern: RegExp) =>
    new Set(
      [...text.matchAll(pattern)]
        .map((match) => checker.resolve(match[1]!, rel))
        .filter((target): target is string => target !== undefined),
    )

  for (const rel of checker.sources) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8')
    texts.set(rel, text)
    imports.set(rel, resolved(rel, text, IMPORT_SPECIFIER))
    reExports.set(rel, resolved(rel, text, RE_EXPORT))
  }

  /**
   * The files that read `files`: the ones that import one of them, directly or
   * through a barrel that re-exports it, and the ones that use a name one of
   * them hands to the auto-import plugin.
   */
  return function dependentsOf(files: string[]): string[] {
    const targets = new Set(files)
    const queue = [...files]
    const dependents = new Set<string>()

    while (queue.length > 0) {
      const target = queue.pop()!
      for (const [rel, found] of imports) {
        if (!found.has(target) || files.includes(rel)) continue
        dependents.add(rel)
        if (reExports.get(rel)?.has(target) && !targets.has(rel)) {
          targets.add(rel)
          queue.push(rel)
        }
      }
    }

    for (const file of files.filter((rel) => AUTO_IMPORTED.test(rel))) {
      const names = [...(texts.get(file) ?? '').matchAll(EXPORTED_NAME)].map((match) => match[1]!)
      const used = new RegExp(`(?<![\\w$.])(?:${names.join('|')})(?![\\w$])`)
      for (const [rel, text] of texts) {
        if (names.length > 0 && !files.includes(rel) && used.test(text)) dependents.add(rel)
      }
    }

    return [...dependents].sort((a, b) => a.localeCompare(b))
  }
}

const isManaged = (rel: string) => ['managed', 'merged'].includes(classify(rel))
const signature = (found: Diagnostic) => `${found.file}|${found.code}|${found.message}`
const describeFinding = (found: Diagnostic) => `${found.file}: ${found.code} ${found.message}`

const RBAC_TYPES = 'src/modules/core/lib/rbac/types.ts'
const RBAC_INHERITANCE = 'src/modules/core/lib/rbac/inheritance.ts'
const AUTH_STORE = 'src/modules/app/stores/auth.ts'
const ADAPTER_BASE = 'src/modules/auth/adapters/base.ts'

describe.skipIf(!CLI_PRESENT || !hasTags || !MAINTAINER)(
  'managed code beside a file the project kept at 1.0',
  () => {
    let checker: Checker
    let dependentsOf: ReturnType<typeof importGraph>
    let promoted: Step[]

    beforeAll(async () => {
      promoted = (await collectMigrationsAsync('1.0.1-alpha.6', '1.1.0-alpha.0')).flatMap(
        (migration: { steps: Step[] }) => migration.steps.filter((step) => step.kind === 'promote'),
      )
      checker = createChecker()
      dependentsOf = importGraph(checker)
    })

    /** Every promoted file once: by itself, or in the unit it moves with. */
    function keptStates(): Kept[] {
      const units = new Map<string, string[]>()
      const states: Kept[] = []

      for (const step of promoted) {
        if (step.unit === undefined) states.push({ name: step.file!, files: [step.file!] })
        else units.set(step.unit, [...(units.get(step.unit) ?? []), step.file!])
      }
      for (const [unit, files] of units) states.push({ name: `the ${unit} unit`, files })

      return states
    }

    /**
     * What the managed files that read `files`, and `files` themselves, report
     * with `files` at 1.0 that they do not report in this release.
     */
    function newFindings(files: string[]): Diagnostic[] {
      const checked = [...files, ...dependentsOf(files).filter(isManaged)]
      const before = new Set(checker.baseline(checked).map(signature))
      const kept = Object.fromEntries(files.map((rel) => [rel, released(rel)]))

      return checker.withKept(kept, checked).filter((found) => !before.has(signature(found)))
    }

    it('covers every promoted file the type checker reads', () => {
      const covered = keptStates().flatMap((state) => state.files)

      expect(promoted.length).toBeGreaterThan(25)
      expect(covered.toSorted()).toEqual(promoted.map((step) => step.file!).toSorted())
      for (const rel of covered.filter(isChecked)) {
        expect(checker.sources, `${rel} is not in the program`).toContain(rel)
      }
      // The scripts are not type-checked. Each is either imported by nothing
      // Vuestrata manages, or only by the file it is promoted with.
      expect(covered.filter((rel) => !isChecked(rel)).toSorted()).toEqual([
        'scripts/build/verify-bundle.mjs',
        'scripts/build/write-version.mjs',
        'scripts/security/headers.mjs',
        'scripts/security/sync-headers.mjs',
      ])
    })

    // The harness has to be able to fail. base.ts by itself is no longer a state
    // an upgrade leaves a project in (it moves with jwt.ts and types.ts), which
    // makes it the control: this is the defect the unit exists for.
    it('sees the defect it exists for: base.ts alone at 1.0 breaks jwt.ts', () => {
      const found = newFindings([ADAPTER_BASE])

      expect(found.map((entry) => entry.file)).toContain('src/modules/auth/adapters/jwt.ts')
      expect(found.map((entry) => entry.message).join('\n')).toMatch(/refreshWithToken/)
      expect(found.map((entry) => entry.message).join('\n')).toMatch(/getUserAs/)
    })

    it('reads a kept auth store through the files that call its new members', () => {
      // Not vacuous: these are the callers of `clearAuth(reason)`, the member
      // the first defect of this class was about.
      expect(dependentsOf([AUTH_STORE]).filter(isManaged)).toEqual(
        expect.arrayContaining([
          'src/modules/app/bootstrap/index.ts',
          'src/modules/auth/composables/useAuth.ts',
        ]),
      )
    })

    it('type-checks beside every promoted file left at 1.0, alone or as its unit', () => {
      const failures: string[] = []

      for (const state of keptStates()) {
        const files = state.files.filter(isChecked)
        if (files.length === 0) continue

        const found = newFindings(files)
        if (found.length > 0) {
          failures.push(
            `With ${state.name} kept at 1.0.1-alpha.6:\n` +
              found.map((entry) => `    ${describeFinding(entry)}`).join('\n'),
          )
        }
      }

      expect(
        failures,
        'Managed code reads something a 1.0 copy of a promoted file does not have. A project ' +
          'that edited that file keeps it, and its build fails in a file it never touched. Read ' +
          'the new member through a type the old file satisfies, or promote the files as one ' +
          'unit (packages/cli/migrations/1.1.0/promotions.mjs).\n\n' +
          failures.join('\n\n'),
      ).toEqual([])
    })

    it('promotes base.ts, jwt.ts and types.ts as the unit the adapters need', () => {
      const unit = promoted.filter((step) => step.unit && ADAPTER_UNIT_FILES.includes(step.file))

      expect(unit.map((step) => step.file)).toEqual(ADAPTER_UNIT_FILES)
      expect(new Set(unit.map((step) => step.unit)).size).toBe(1)
    })

    // Not promoted in 1.1.0, but the file 1.0 told a project to edit: "adding a
    // domain means adding its permissions [to types.ts] and granting them in
    // inheritance.ts". It is managed, so an edited copy is kept.
    it('type-checks beside a core/lib/rbac/inheritance.ts the project kept', () => {
      expect(newFindings([RBAC_INHERITANCE]).map(describeFinding)).toEqual([])
    })

    // The one that does not, and the reason the migration has a note of its own
    // for it (rbac-eject.mjs): the release's rbac files import types that a 1.0
    // types.ts does not declare. When this starts to pass, the note is out of
    // date.
    //
    // The list grew when roles became declarable (`BuiltinRole`, `AppRoles` and
    // the types of the role table are new too). It is still one mistake with
    // one remedy, the one the note gives: take the release's types.ts. What is
    // asserted is that nothing OUTSIDE the RBAC layer and its two readers
    // breaks, and that the findings start from names the 1.0 file lacks.
    it('does not type-check beside a kept core/lib/rbac/types.ts, which the migration says', () => {
      const found = newFindings([RBAC_TYPES])

      expect([...new Set(found.map((entry) => entry.file))].toSorted()).toEqual([
        'src/modules/app/composables/useRbac.ts',
        'src/modules/core/lib/rbac/index.ts',
        'src/modules/core/lib/rbac/inheritance.ts',
        'src/modules/core/lib/rbac/overrides.ts',
        'src/modules/core/lib/rbac/role-graph.ts',
        'src/modules/core/lib/rbac/roles.ts',
        'src/modules/core/lib/runtime.ts',
      ])
      const missing = found
        .filter((entry) => /has no exported member/.test(entry.message))
        .map((entry) => entry.message)
        .join('\n')
      for (const name of ['RbacOverrides', 'BuiltinRole', 'ResolvedProjectRole']) {
        expect(missing).toContain(`'${name}'`)
      }
    })
  },
)

describe.skipIf(!CLI_PRESENT)('the promoted scripts', () => {
  // `.mjs` is outside the type checker, so the same rule is checked by name.
  //
  // A managed script outside a promoted script's unit is replaced, or installed
  // new, beside a copy of that script the project may have kept from 1.0. A
  // named import of something the 1.0 copy does not export fails when the
  // module is linked, before any code can ask: for the Vite plugin, that is
  // `vite.config.ts` failing to load, and every `vp` command with it. So such
  // a script imports the promoted one as a namespace, where a missing member is
  // `undefined`, and asks for each member 1.1.0 added before it uses it.

  interface Importer {
    /** The managed script that imports. */
    rel: string
    /** The promoted script it imports, from outside that script's unit. */
    promoted: string
    /** The import clause: `* as name`, `{ a, b }`, `name`. */
    clause: string
    source: string
  }

  const IMPORT_FROM = /\bimport\s+([^'"]*?)\s+from\s*['"]([^'"]+)['"]/g
  const EXPORTED = /^export\s+(?:async\s+)?(?:function\s*\*?|const|let|class)\s+([\w$]+)/gm
  const exportsOf = (source: string) => [...source.matchAll(EXPORTED)].map((match) => match[1]!)

  async function importers(): Promise<Importer[]> {
    const steps: Step[] = (await collectMigrationsAsync('1.0.1-alpha.6', '1.1.0-alpha.0')).flatMap(
      (migration: { steps: Step[] }) => migration.steps.filter((step) => step.kind === 'promote'),
    )
    const scripts = steps.filter((step) => step.file!.endsWith('.mjs'))
    const managedScripts = fs
      .readdirSync(path.join(REPO, 'scripts'), { recursive: true, encoding: 'utf8' })
      .map((entry) => `scripts/${posix(entry)}`)
      .filter((rel) => /\.m?js$/.test(rel) && isManaged(rel))

    expect(scripts.length).toBeGreaterThan(0)

    const found: Importer[] = []
    for (const script of scripts) {
      const unit = steps.filter((step) => step.unit && step.unit === script.unit)
      const inUnit = new Set([script.file!, ...unit.map((step) => step.file!)])

      for (const rel of managedScripts.filter((file) => !inUnit.has(file))) {
        const source = fs.readFileSync(path.join(REPO, rel), 'utf8')
        for (const [, clause, specifier] of source.matchAll(IMPORT_FROM)) {
          if (!specifier!.startsWith('.')) continue
          if (posix(path.join(path.dirname(rel), specifier!)) !== script.file) continue
          found.push({ rel, promoted: script.file!, clause: clause!, source })
        }
      }
    }
    return found
  }

  it('are imported from outside their unit only as a namespace', async () => {
    const found = await importers()

    // Not vacuous: the Vite plugin reads the header generators.
    expect(found.map((entry) => `${entry.rel} <- ${entry.promoted}`)).toContain(
      'scripts/vite/vuestrata-plugin.mjs <- scripts/security/headers.mjs',
    )
    for (const entry of found) {
      expect(
        entry.clause,
        `${entry.rel} imports names from ${entry.promoted}. A project that edited that file ` +
          'keeps its 1.0 copy, and a name it does not export stops this script from loading. ' +
          'Import it as a namespace and ask for what 1.1.0 added (`typeof x === "function"`).',
      ).toMatch(/^\*\s+as\s+[\w$]+$/)
    }
  })

  it.skipIf(!hasTags)('have every member 1.1.0 added asked for before it is used', async () => {
    for (const entry of await importers()) {
      const before = new Set(exportsOf(released(entry.promoted)))
      const added = exportsOf(fs.readFileSync(path.join(REPO, entry.promoted), 'utf8')).filter(
        (name) => !before.has(name),
      )
      // The harness has to be able to fail: there is something new to ask for.
      expect(added.length, `${entry.promoted} gained no export in 1.1.0`).toBeGreaterThan(0)

      const used = added.filter((name) =>
        new RegExp(String.raw`(?<![\w$])${name}(?![\w$])`).test(entry.source),
      )
      const askedFor = (name: string) =>
        new RegExp(String.raw`typeof\s+(?:[\w$]+\??\.)?${name}\s*===\s*['"]function['"]`).test(
          entry.source,
        )

      expect(
        used.filter((name) => !askedFor(name)),
        `${entry.rel} uses members ${entry.promoted} did not export at 1.0.1-alpha.6 without ` +
          'asking whether they are there',
      ).toEqual([])
    }
  })
})
