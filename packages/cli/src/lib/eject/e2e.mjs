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
 * deleted. What survives still visits only routes that exist.
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

/** A leaf `test(...)`, but not `test.describe`, a hook or `test.use`. */
const LEAF = /^[ \t]*test(?:\.(?:only|skip|fixme))?\(/gm
const DESCRIBE = /^[ \t]*test\.describe(?:\.(?:serial|parallel|only|skip))?\(/gm
const HOOK = /^[ \t]*test\.(?:beforeEach|beforeAll|afterEach|afterAll)\(/gm

/**
 * The marketing home page is not a route the project keeps, and its specs name it
 * rather than visit it: they visit `/`, which still resolves, and assert on the
 * hero. Its tests are recognised by title.
 */
const HOME_TITLE = /^[ \t]*test(?:\.\w+)*\(\s*(['"`])[^'"`\n]*\b(?:home\s*page|hero)\b/im

const HAS_LEAF = /\btest(?:\.(?:only|skip|fixme))?\(/

/**
 * `source` without the tests, routes and helpers tied to `prefixes`, or `null`
 * when nothing that tests anything is left. `dropped` counts what went, for the
 * report.
 *
 * @returns {{ contents: string | null, changed: boolean, dropped: number }}
 */
export function pruneSpec(source, prefixes) {
  if (!mentionsRemovedRoute(source, prefixes) && !HOME_TITLE.test(source)) {
    return { contents: source, changed: false, dropped: 0 }
  }

  let dropped = 0
  let next = pruneRouteLists(source, prefixes)
  const tainted = taintedHelpers(next, prefixes)

  for (;;) {
    const before = next

    for (const range of statementRanges(next, LEAF)) {
      const text = next.slice(range.start, range.end)
      if (
        !mentionsRemovedRoute(text, prefixes) &&
        !callsAny(text, tainted) &&
        !HOME_TITLE.test(text)
      ) {
        continue
      }
      next = cut(next, range)
      dropped++
      break
    }
    if (next !== before) continue

    // A hook that opens a removed route poisons every test it runs before, so
    // the scope it belongs to goes — the enclosing `describe`, or the file.
    const describes = statementRanges(next, DESCRIBE)
    const hook = statementRanges(next, HOOK).find((range) => {
      const text = next.slice(range.start, range.end)
      return mentionsRemovedRoute(text, prefixes) || callsAny(text, tainted)
    })
    if (hook) {
      const scope = describes
        .filter((range) => range.start <= hook.start && hook.end <= range.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
      if (!scope) return { contents: null, changed: true, dropped }
      next = cut(next, scope)
      continue
    }

    for (const range of describes) {
      const text = next.slice(range.start, range.end)
      if (HAS_LEAF.test(stripComments(text)) && !HOME_TITLE.test(text)) continue
      next = cut(next, range)
      break
    }
    if (next === before) break
  }

  next = removeUnusedHelpers(next).replace(/\n{3,}/g, '\n\n')

  const remaining = stripComments(next)
  return {
    contents: HAS_LEAF.test(remaining) ? next : null,
    changed: next !== source,
    dropped,
  }
}

const callsAny = (text, names) =>
  names.some((name) => new RegExp(`\\b${name}\\b`).test(stripComments(text)))

/**
 * Top-level helper functions that visit a removed route, directly or through
 * another such helper. A spec rarely writes the URL in the test: it calls
 * `goToFormsPage(page)`, and the route is one function away.
 */
function taintedHelpers(source, prefixes) {
  const helpers = []
  for (const match of source.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const params = findClose(source, match.index + match[0].length - 1)
    const open = params === -1 ? -1 : source.indexOf('{', params)
    const close = open === -1 ? -1 : findClose(source, open)
    if (close !== -1) helpers.push({ name: match[1], body: source.slice(match.index, close) })
  }

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
