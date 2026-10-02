/**
 * The project-owned files `eject` rewrites beyond the module registry: the
 * scripts and dependencies in `package.json`, the Dockerfile, the CI workflow,
 * and the links in the top-level Markdown files. Each is a pure function from
 * source text to source text, so a `--dry-run` runs exactly what a real run does.
 */

/** The bin the `gen:*` scripts ran through the frozen copy, before `eject`. */
const LOCAL_CLI = 'node packages/cli/src/index.mjs'

/**
 * Dependencies only the documentation site imports. Removed together with it —
 * and only when nothing that remains imports them, so a project that kept a
 * docs component keeps what it needs.
 */
const DOCS_ONLY_DEPENDENCIES = ['axe-core', 'shiki', 'beautiful-mermaid', 'comark', /^@shikijs\//]

/**
 * The scripts the template adds for its maintainers. Named rather than matched
 * by prefix: `release:notes` in a project is the project's.
 */
const TEMPLATE_SCRIPTS = new Set([
  'lint:maintainer',
  'lint:template-lock',
  'release:verify',
  'cli:payload',
])

const isDocsOnly = (name) =>
  DOCS_ONLY_DEPENDENCIES.some((entry) =>
    entry instanceof RegExp ? entry.test(name) : entry === name,
  )

/** `axe-core` for `axe-core/x`, `@scope/pkg` for `@scope/pkg/x`; `undefined` for a path. */
export function packageOf(specifier) {
  if (
    /^(?:\.{1,2}\/|[~@]\/|\/)/.test(specifier) ||
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('node:')
  )
    return undefined
  const [first, second] = specifier.split('/')
  return first.startsWith('@') ? `${first}/${second}` : first
}

/**
 * `package.json` after `eject`: the local CLI calls point at the installed
 * `vuestrata` bin, scripts that ran what was removed are dropped, and
 * dependencies only the docs site used are pruned.
 *
 * @param {string} source `package.json`.
 * @param {{ removed: (rel: string) => boolean, imported: Set<string> }} context
 *   `removed` says whether a repo path is being deleted; `imported` holds every
 *   package the files that remain import.
 * @returns {{ contents: string, changes: string[], notes: string[], vendorUnused: boolean }}
 */
export function rewritePackageJson(source, { removed, imported }) {
  const pkg = JSON.parse(source)
  const changes = []
  const notes = []

  // The template's own maintainer scripts go, by name — but only when they still
  // run something that is being removed, so a project that rewrote one keeps it.
  // `release:verify` runs no removed path; it calls the `lint:maintainer` script,
  // which is why a script that runs a dropped one counts as running something
  // removed too, and why this runs to a fixed point.
  const dropped = new Set()
  for (let grew = true; grew;) {
    grew = false
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      if (dropped.has(name) || !TEMPLATE_SCRIPTS.has(name)) continue
      const segments = command.split(/\s*&&\s*/)
      if (
        !segments.some((segment) => runsRemoved(segment, removed) || runsScript(segment, dropped))
      ) {
        continue
      }
      dropped.add(name)
      grew = true
    }
  }
  for (const name of dropped) {
    delete pkg.scripts[name]
    changes.push(`remove script "${name}"`)
  }

  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    const segments = command
      .split(/\s*&&\s*/)
      .map((segment) => segment.replaceAll(LOCAL_CLI, 'vuestrata'))
      .filter((segment) => !runsRemoved(segment, removed) && !runsScript(segment, dropped))
    const next = segments.join(' && ')
    if (next === command) continue

    if (segments.length === 0) {
      delete pkg.scripts[name]
      changes.push(`remove script "${name}"`)
    } else {
      pkg.scripts[name] = next
      changes.push(`rewrite script "${name}"`)
    }
  }

  for (const group of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(pkg[group] ?? {})) {
      if (!isDocsOnly(name) || imported.has(name)) continue
      delete pkg[group][name]
      changes.push(`remove ${group === 'dependencies' ? 'dependency' : 'devDependency'} "${name}"`)
    }
  }

  const vendorUnused = !Object.values({ ...pkg.dependencies, ...pkg.devDependencies }).some(
    (spec) => typeof spec === 'string' && /^file:(?:\.\/)?vendor\//.test(spec),
  )

  const declared = { ...pkg.dependencies, ...pkg.devDependencies }
  if (Object.values(pkg.scripts ?? {}).some((command) => /^vuestrata\b/.test(command))) {
    if (!('@vuestrata/cli' in declared)) {
      notes.push(
        'The gen:*, doctor, diff and upgrade scripts now call the `vuestrata` bin. Install it with ' +
          '`vp add -D @vuestrata/cli`.',
      )
    }
  }

  if (changes.some((change) => change.includes('dependenc') || change.includes('devDependenc'))) {
    notes.push('Run `vp install` to bring pnpm-lock.yaml in line with the pruned dependencies.')
  }

  return { contents: `${JSON.stringify(pkg, null, 2)}\n`, changes, notes, vendorUnused }
}

/** Whether a shell segment runs one of the package scripts in `names`. */
function runsScript(segment, names) {
  const match = /(?:^|\s)(?:vp run|vpr|pnpm run|npm run|yarn run)\s+([\w:.-]+)/.exec(segment)
  return match !== null && names.has(match[1])
}

/** Whether a shell segment runs a path that is being removed. */
function runsRemoved(segment, removed) {
  return [...segment.matchAll(/(?:^|\s)(?:\.\/)?([\w@.-]+(?:\/[\w@.-]+)+)/g)].some(([, rel]) =>
    removed(rel),
  )
}

/**
 * The Dockerfile without the `COPY vendor/` line and the comment above it, or
 * `undefined` if there was none. The tarball it copied is the vendored `comark`.
 */
export function dropVendorCopy(source) {
  const lines = source.split('\n')
  const at = lines.findIndex((line) => /^COPY\s+vendor\/\s+\.\/vendor\/\s*$/.test(line))
  if (at === -1) return undefined

  let from = at
  while (from > 0 && lines[from - 1].startsWith('#')) from--
  lines.splice(from, at - from + 1)
  return lines.join('\n')
}

/**
 * The CI workflow without the `cli-roundtrip` job, which runs the CLI from
 * `packages/cli`, and without its entry in the `needs` of the job that gates on
 * it. `undefined` when there was no such job.
 */
export function dropCliRoundtrip(source) {
  const lines = source.split('\n')
  const at = lines.findIndex((line) => /^ {2}cli-roundtrip:\s*$/.test(line))
  if (at === -1) return undefined

  let from = at
  while (from > 0 && /^ {2}#/.test(lines[from - 1])) from--

  let to = at + 1
  while (to < lines.length && !/^ {2}\S/.test(lines[to])) to++
  // Keep the blank line that separated this job from the one before it.
  lines.splice(from, to - from)

  return lines
    .join('\n')
    .replace(/(needs:\s*\[[^\]]*?),\s*cli-roundtrip(\s*\])/, '$1$2')
    .replace(/(needs:\s*\[)\s*cli-roundtrip,\s*/, '$1')
}

/**
 * Remove the button that links to `/docs` from the not-found page. The link is
 * a dead end once the docs site is gone, and the page is the project's to edit.
 */
export function dropNotFoundDocsLink(source) {
  const next = source.replace(/\n[ \t]*<UiButton\s+to="\/docs"[\s\S]*?<\/UiButton>/, '')
  return next === source ? undefined : next
}

/** Where the upstream template's tagged files live, for links that left `docs/`. */
export const UPSTREAM_REPOSITORY = 'https://github.com/boussadjra/vuestrata'

/**
 * `README.md`, `CONTRIBUTING.md` and `SECURITY.md` with the links into `docs/`
 * pointed at the upstream copy of that file at the release the project was
 * created from. The pages themselves go with the docs site, and a relative link
 * to a page that is gone fails the docs link check on the first `vpr lint`.
 *
 * Code fences are left alone: what they show is an example, not a reference.
 *
 * `isGone` says whether a `docs/` path was removed, so a link to a page the
 * project kept stays relative. Without it every link is rewritten.
 */
export function rewriteDocLinks(source, ref, isGone = () => true) {
  const urlFor = (target) => {
    const bare = target.replace(/^\.\//, '')
    const isDirectory = bare.endsWith('/') || !/\.[A-Za-z0-9]+$/.test(bare)
    return `${UPSTREAM_REPOSITORY}/${isDirectory ? 'tree' : 'blob'}/${ref}/${bare.replace(/\/$/, '')}${isDirectory ? '/' : ''}`
  }

  return source
    .split(/(^```[\s\S]*?^```)/m)
    .map((part) => {
      if (part.startsWith('```')) return part

      return part
        .replace(
          /\]\((?:\.\/)?(docs(?:\/[^)#\s]*)?)(#[^)\s]*)?\)/g,
          (whole, target, anchor = '') =>
            isGone(target.replace(/\/$/, '')) ? `](${urlFor(target)}${anchor})` : whole,
        )
        .replace(/(?<!\[)`(docs\/[A-Za-z0-9_./-]+\.md)`/g, (whole, target) =>
          isGone(target) ? `[\`${target}\`](${urlFor(target)})` : whole,
        )
    })
    .join('')
}

/**
 * The `no-raw-palette` lint rule keeps a ratchet: a map of files that still hold
 * raw Tailwind palette classes, with how many. It fails when a file in the map
 * has fewer, which is what deleting the file is — so an entry for a removed file
 * must go with it (the showcase's `tables.vue` is one).
 */
export function dropRawPaletteBaseline(source, removed) {
  const next = source
    .split('\n')
    .filter((line) => {
      const entry = /^\s*\['([^']+)',\s*\d+\],?\s*$/.exec(line)
      return !(entry && removed(entry[1]))
    })
    .join('\n')
  return next === source ? undefined : next
}
