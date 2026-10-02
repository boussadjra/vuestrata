import { findClose, stripComments } from './source.mjs'

/**
 * End-to-end specs that visit routes `eject` removed.
 *
 * A spec imports nothing from the module it exercises — it opens a URL — so the
 * import scan that finds orphaned unit tests never sees it. What ties a spec to
 * a removed module is the routes it visits, and those are read here as text:
 * `page.goto('/docs')`, `toHaveURL(/\/dashboard\/orders/)`, and the route lists
 * that tests are generated from.
 *
 * Pruning is by the smallest unit that can be judged from the route alone. A
 * route in a list is dropped from the list; a `test(...)` that mentions one is
 * dropped; a `describe` left with no tests goes; a spec left with none is
 * deleted. What survives still visits only routes that exist — except in a form
 * this cannot read, such as a test written on a fixture imported from another
 * file. Those are kept and named in the report, because a test that is wrongly
 * deleted is one nobody knows is missing.
 */

/** Prefixes that are never removed, whatever a removed module declares. */
const PROTECTED = new Set(['/', '/dashboard', '/auth', '/403'])

/**
 * `/dashboard/orders` for `/dashboard/orders/:id`; `/docs` for `/docs/x`. Two
 * segments under `/dashboard` because every module lives there — a prefix of
 * `/dashboard` alone would claim the whole app.
 */
export function routePrefix(routePath) {
  const segments = routePath.split('/').filter(Boolean)
  if (segments.length === 0 || segments[0].startsWith(':')) return undefined
  if (segments[0] === 'dashboard') {
    return segments[1] && !segments[1].startsWith(':') ? `/dashboard/${segments[1]}` : undefined
  }
  return `/${segments[0]}`
}

/**
 * The route prefixes that no longer resolve: those of the removed modules and
 * of the shell sections `eject` deletes, less any a surviving module also owns.
 */
export function removedRoutePrefixes({ removedRoutes, keptRoutes, shell }) {
  const kept = new Set(keptRoutes.map(routePrefix).filter(Boolean))
  const prefixes = new Set([...removedRoutes.map(routePrefix), ...shell].filter(Boolean))
  return [...prefixes].filter((prefix) => !PROTECTED.has(prefix) && !kept.has(prefix)).sort(byName)
}

const byName = (a, b) => a.localeCompare(b)

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `route` is `prefix` or lies beneath it, ignoring a query string. */
function isRemovedRoute(route, prefixes) {
  const bare = route.split(/[?#]/)[0].replace(/\/+$/, '')
  return prefixes.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`))
}

/**
 * Whether `text` names a removed route anywhere — in a string, a template or a
 * regex literal (whose `\/` is read as `/`). The character before a prefix must
 * not continue a path or a package name, so `@/components/ui` and `../docs.md`
 * are not mistaken for the `/components` and `/docs` routes.
 */
export function mentionsRemovedRoute(text, prefixes) {
  const normalized = stripComments(text).replaceAll('\\/', '/')
  return prefixes.some((prefix) =>
    new RegExp(`(?<![\\w.@:$-])${escapeRegex(prefix)}(?![\\w-])`).test(normalized),
  )
}

/**
 * The names a spec calls its tests through. `test` always; plus whatever it is
 * aliased or extended to (`import { test as base }`, `const authed = base.extend()`).
 * A spec written on a fixture alias is still a spec, and `authed('orders', …)` is
 * as much a test as `test('orders', …)`.
 */
function testNames(source) {
  const names = new Set(['test'])
  for (const match of source.matchAll(/\btest\s+as\s+([\w$]+)/g)) names.add(match[1])
  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([\w$]+)\s*=\s*[\w$.]+\.extend\s*[<(]/g,
  )) {
    names.add(match[1])
  }
  return [...names]
}

/** The call patterns for `names`: a leaf, a `describe`, a hook, and any call at all. */
function callPatterns(names) {
  const alternation = names.map(escapeRegex).join('|')
  return {
    leaf: new RegExp(`^[ \\t]*(?:${alternation})(?:\\.(?:only|skip|fixme))?\\(`, 'gm'),
    describe: new RegExp(
      `^[ \\t]*(?:${alternation})\\.describe(?:\\.(?:serial|parallel|only|skip))?\\(`,
      'gm',
    ),
    hook: new RegExp(
      `^[ \\t]*(?:${alternation})\\.(?:beforeEach|beforeAll|afterEach|afterAll)\\(`,
      'gm',
    ),
    hasLeaf: new RegExp(`\\b(?:${alternation})(?:\\.(?:only|skip|fixme))?\\(`),
  }
}

/**
 * A call that looks like a test whatever it is called: a title, then an
 * optional options object, then a function. It is how a spec written on a
 * fixture imported from another file (`import { authedTest } from './fixtures'`)
 * is recognised as a spec, even though no name in it says so.
 */
const TEST_LIKE =
  /^[ \t]*[\w$]+(?:\.(?:only|skip|fixme|slow))?\(\s*(['"`])((?:(?!\1)[^\n\\]|\\.)*)\1\s*,\s*(?:\{[^{}]*\}\s*,\s*)?(?:async\b|function\b|\(|[\w$]+\s*=>)/gm

/** The `{ title, text }` of each test-like call in `source`. */
function testLikeCalls(source) {
  const calls = []
  for (const match of source.matchAll(TEST_LIKE)) {
    const open = match.index + match[0].indexOf('(')
    const close = findClose(source, open)
    if (close === -1) continue
    calls.push({ title: match[2], text: source.slice(match.index, close) })
  }
  return calls
}

/**
 * The tests of the marketing home page: a test, or a `describe`, titled for the
 * hero or the home page, whose tests open `/`. They name the page rather than a
 * removed route — `/` still resolves — so they are recognised by both.
 *
 * A title alone is not enough: a project's `test('hero image upload')` that
 * visits `/dashboard/customers` has nothing to do with the marketing page. And
 * they go only when `eject` replaces that page with its redirect (`home`); a
 * project that wrote its own landing page keeps the tests of it.
 */
const HOME_TITLE = /^[ \t]*[\w$]+(?:\.\w+)*\(\s*(['"`])[^'"`\n]*\b(?:home\s*page|hero)\b/i
const VISITS_HOME = /\.goto\(\s*(['"`])\/(?:[?#][^'"`]*)?\1/

/**
 * `source` without the tests, routes and helpers tied to `prefixes`, or `null`
 * when nothing that tests anything is left. `dropped` counts what went. For the
 * report, `leftovers` names the tests that still touch a removed route because
 * they are written in a form this cannot cut, and `stray` says one is still
 * named outside any test.
 *
 * It errs toward keeping: a file is deleted only when it has no test-like call
 * left, never because a test it could not read mentions a removed route.
 *
 * @param {string} source
 * @param {string[]} prefixes The route prefixes that no longer resolve.
 * @param {{ home?: boolean }} [options] `home`: the marketing home page is being
 *   replaced, so the tests of it go too.
 * @returns {{ contents: string | null, changed: boolean, dropped: number, leftovers: string[], stray: boolean }}
 */
export function pruneSpec(source, prefixes, { home = false } = {}) {
  const names = testNames(source)
  const patterns = callPatterns(names)
  const leavesOf = (text) =>
    statementRanges(text, patterns.leaf).map((range) => text.slice(range.start, range.end))

  const homeHelpers = topLevelHelpers(source)
    .filter((helper) => VISITS_HOME.test(stripComments(helper.body)))
    .map((helper) => helper.name)
  const visitsHome = (text) => VISITS_HOME.test(stripComments(text)) || callsAny(text, homeHelpers)
  const isHomeTest = (text) => home && HOME_TITLE.test(text) && visitsHome(text)
  // A `describe` goes whole only when every test in it opens the page.
  const isHomeScope = (text) => {
    if (!home || !HOME_TITLE.test(text)) return false
    const leaves = leavesOf(text)
    return leaves.length > 0 && leaves.every(visitsHome)
  }

  const hasHomeTest =
    home &&
    (leavesOf(source).some(isHomeTest) ||
      statementRanges(source, patterns.describe).some((range) =>
        isHomeScope(source.slice(range.start, range.end)),
      ))

  if (!mentionsRemovedRoute(source, prefixes) && !hasHomeTest) {
    return { contents: source, changed: false, dropped: 0, leftovers: [], stray: false }
  }

  let dropped = 0
  let next = pruneRouteLists(source, prefixes)
  const tainted = taintedHelpers(next, prefixes)

  for (;;) {
    const before = next

    const homeScope = statementRanges(next, patterns.describe).find((range) =>
      isHomeScope(next.slice(range.start, range.end)),
    )
    if (homeScope) {
      dropped += leavesOf(next.slice(homeScope.start, homeScope.end)).length
      next = cut(next, homeScope)
      continue
    }

    for (const range of statementRanges(next, patterns.leaf)) {
      const text = next.slice(range.start, range.end)
      if (!mentionsRemovedRoute(text, prefixes) && !callsAny(text, tainted) && !isHomeTest(text)) {
        continue
      }
      next = cut(next, range)
      dropped++
      break
    }
    if (next !== before) continue

    // A hook that opens a removed route poisons every test it runs before, so
    // the scope it belongs to goes — the enclosing `describe`, or the file.
    const describes = statementRanges(next, patterns.describe)
    const hook = statementRanges(next, patterns.hook).find((range) => {
      const text = next.slice(range.start, range.end)
      return mentionsRemovedRoute(text, prefixes) || callsAny(text, tainted)
    })
    if (hook) {
      const scope = describes
        .filter((range) => range.start <= hook.start && hook.end <= range.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
      if (!scope) return { contents: null, changed: true, dropped, leftovers: [], stray: false }
      next = cut(next, scope)
      continue
    }

    for (const range of describes) {
      const text = next.slice(range.start, range.end)
      if (patterns.hasLeaf.test(stripComments(text))) continue
      next = cut(next, range)
      break
    }
    if (next === before) break
  }

  next = removeUnusedImports(removeUnusedHelpers(next)).replace(/\n{3,}/g, '\n\n')

  const remaining = stripComments(next)
  const calls = testLikeCalls(remaining)
  if (!patterns.hasLeaf.test(remaining) && calls.length === 0) {
    return { contents: null, changed: true, dropped, leftovers: [], stray: false }
  }

  const leftovers = calls
    .filter((call) => mentionsRemovedRoute(call.text, prefixes) || callsAny(call.text, tainted))
    .map((call) => call.title)
  // A removed route named where no test could be made out: a constant, a
  // fixture, a list that holds more than routes.
  const stray = leftovers.length === 0 && mentionsRemovedRoute(next, prefixes)

  return { contents: next, changed: next !== source, dropped, leftovers, stray }
}

const callsAny = (text, names) =>
  names.some((name) => new RegExp(`\\b${name}\\b`).test(stripComments(text)))

/** `{ name, body }` of each top-level `function` declaration. */
function topLevelHelpers(source) {
  const helpers = []
  for (const match of source.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const params = findClose(source, match.index + match[0].length - 1)
    const open = params === -1 ? -1 : source.indexOf('{', params)
    const close = open === -1 ? -1 : findClose(source, open)
    if (close !== -1) helpers.push({ name: match[1], body: source.slice(match.index, close) })
  }
  return helpers
}

/**
 * Top-level helper functions that visit a removed route, directly or through
 * another such helper. A spec rarely writes the URL in the test: it calls
 * `goToFormsPage(page)`, and the route is one function away.
 */
function taintedHelpers(source, prefixes) {
  const helpers = topLevelHelpers(source)

  const tainted = new Set(
    helpers.filter((helper) => mentionsRemovedRoute(helper.body, prefixes)).map((h) => h.name),
  )
  for (let grew = true; grew;) {
    grew = false
    for (const helper of helpers) {
      if (tainted.has(helper.name) || !callsAny(helper.body, [...tainted])) continue
      tainted.add(helper.name)
      grew = true
    }
  }
  return [...tainted]
}

/** `{ start, end }` of each whole statement whose first line matches `pattern`. */
function statementRanges(source, pattern) {
  const ranges = []
  for (const match of source.matchAll(pattern)) {
    const close = findClose(source, match.index + match[0].length - 1)
    if (close === -1) continue

    let end = close
    if (source[end] === ';') end++
    end = source.indexOf('\n', end)
    end = end === -1 ? source.length : end + 1
    ranges.push({ start: match.index, end })
  }
  return ranges
}

/** Remove a range, and the comment lines directly above it that describe it. */
function cut(source, { start, end }) {
  let from = start
  while (from > 0) {
    const lineStart = source.lastIndexOf('\n', from - 2) + 1
    if (!/^\s*(?:\/\/|\/?\*)/.test(source.slice(lineStart, from - 1))) break
    from = lineStart
  }
  return source.slice(0, from) + source.slice(end)
}

/**
 * Drop the routes `prefixes` name from every array that is nothing but routes,
 * and the loop or constant that array fed once it is empty.
 */
function pruneRouteLists(source, prefixes) {
  const emptied = []

  let next = source.replace(/\[([^[\]]*)\]/g, (whole, inner, offset, all) => {
    const tokens = [...inner.matchAll(/(['"])(\/[^'"\n]*)\1/g)]
    if (tokens.length === 0) return whole
    // Only arrays that hold nothing but routes: anything else is code.
    const rest = stripComments(inner).replace(/(['"])(\/[^'"\n]*)\1/g, '')
    if (rest.replace(/[\s,]/g, '') !== '') return whole

    const doomed = tokens.filter((token) => isRemovedRoute(token[2], prefixes))
    if (doomed.length === 0) return whole

    let pruned = inner
    for (const token of doomed.reverse()) {
      let start = token.index
      let end = token.index + token[0].length
      const trailing = /^[ \t]*,?[ \t]*(?:\/\/[^\n]*)?/.exec(pruned.slice(end))[0]
      const hadComma = trailing.includes(',')
      end += trailing.length

      const lineStart = pruned.lastIndexOf('\n', start - 1) + 1
      if (/^[ \t]*$/.test(pruned.slice(lineStart, start)) && pruned[end] === '\n') {
        start = lineStart
        end += 1
      } else if (!hadComma) {
        // The last element of an inline list: take the comma before it instead.
        const before = /,[ \t]*$/.exec(pruned.slice(0, start))
        if (before) start -= before[0].length
      }
      pruned = pruned.slice(0, start) + pruned.slice(end)
    }

    if (stripComments(pruned).replace(/[\s,]/g, '') === '') {
      // Named when it is a constant, so the loop that reads it can go too.
      const declaration = /\b(?:const|let)\s+(\w+)\s*(?::[^=\n]+)?=\s*$/.exec(all.slice(0, offset))
      emptied.push(declaration?.[1])
    }
    return `[${pruned}]`
  })

  if (emptied.length === 0) return next

  next = removeLoopsOver(next, /\[\s*(?:\/\/[^\n]*\s*)*\]/.source)

  for (const name of emptied.filter(Boolean)) {
    next = removeLoopsOver(next, `\\b${name}\\b`)
    next = next.replace(
      new RegExp(
        `^[ \\t]*(?:const|let)\\s+${name}\\s*(?::[^=\\n]+)?=\\s*\\[[^\\]]*\\]\\s*;?\\n`,
        'm',
      ),
      '',
    )
  }
  return next
}

/** Remove each `for (… of <iterable>) { … }` statement over a matching iterable. */
function removeLoopsOver(source, iterable) {
  const header = new RegExp(
    `^[ \\t]*for\\s*\\(\\s*(?:const|let)\\s+\\w+\\s+of\\s+${iterable}\\s*\\)\\s*\\{`,
    'gm',
  )
  let next = source
  for (;;) {
    const match = header.exec(next)
    if (!match) return next
    const close = findClose(next, match.index + match[0].length - 1)
    if (close === -1) return next
    const end = next.indexOf('\n', close)
    next = cut(next, { start: match.index, end: end === -1 ? next.length : end + 1 })
    header.lastIndex = 0
  }
}

/**
 * Remove top-level `function` declarations nothing calls any more — a helper
 * that opened the docs sidebar, once every test that used it has gone.
 */
function removeUnusedHelpers(source) {
  let next = source
  for (;;) {
    let removed = false

    for (const match of next.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
      const uses = next.match(new RegExp(`\\b${match[1]}\\b`, 'g'))?.length ?? 0
      if (uses > 1) continue

      const params = findClose(next, match.index + match[0].length - 1)
      const open = next.indexOf('{', params)
      const close = open === -1 ? -1 : findClose(next, open)
      if (close === -1) continue

      const end = next.indexOf('\n', close)
      next = cut(next, { start: match.index, end: end === -1 ? next.length : end + 1 })
      removed = true
      break
    }

    if (!removed) return next
  }
}

/**
 * Drop named imports nothing uses any more: `Page` once the tests that took a
 * `page: Page` helper are gone, or `expect` once no test asserts. A warning if
 * left, but a warning nobody wrote is a poor first lint run.
 */
function removeUnusedImports(source) {
  return source.replace(
    /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"][^'"]+['"])\s*;?\n/gm,
    (whole, typeOnly = '', list, from) => {
      const rest = stripComments(source.replace(whole, ''))
      const names = list
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
      const used = names.filter((name) => {
        const local = name
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .pop()
        return new RegExp(`\\b${local}\\b`).test(rest)
      })

      if (used.length === names.length) return whole
      if (used.length === 0) return ''
      return `import ${typeOnly}{ ${used.join(', ')} } from ${from}\n`
    },
  )
}
