import { createRequire } from 'node:module'

import { describe, expect, it } from 'vite-plus/test'
import * as Vue from 'vue'

import { parseVueErrorInfo } from '@/lib/errors'

/**
 * `parseVueErrorInfo` carries a copy of Vue's error-code table, because
 * `core/lib` may not import Vue. These tests read the table out of the INSTALLED
 * Vue and compare, so an upgrade that renumbers a code or adds one fails here,
 * loudly, instead of silently turning a setup failure into "unknown" in
 * production.
 */

const productionInfo = (key: string | number) => `https://vuejs.org/error-reference/#runtime-${key}`

// Vue exports the table at runtime and leaves it out of its type declarations.
// It is keyed by number (codes) and by short string (lifecycle hooks).
const { ErrorCodes } = Vue
const ErrorTypeStrings =
  (Vue as unknown as { ErrorTypeStrings?: Record<string, string> }).ErrorTypeStrings ?? {}

const vueTable = Object.entries(ErrorTypeStrings).map(
  ([key, name]) => [/^\d+$/.test(key) ? Number(key) : key, name] as const,
)

describe('the table matches the installed Vue', () => {
  it('reads a non-empty table', () => {
    // Guards the test itself: an empty table would make every loop below vacuous.
    expect(vueTable.length).toBeGreaterThan(25)
  })

  it.each(vueTable)('code %s ("%s") parses in both forms', (code, name) => {
    const dev = parseVueErrorInfo(name)
    const prod = parseVueErrorInfo(productionInfo(code))

    expect(dev).toMatchObject({ code, name })
    expect(prod).toEqual(dev)
  })

  it('agrees with the numeric ErrorCodes Vue exports', () => {
    const numeric = Object.entries(ErrorCodes).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    )
    expect(numeric.length).toBeGreaterThan(10)

    for (const [, code] of numeric) {
      expect(parseVueErrorInfo(productionInfo(code)).code).toBe(code)
    }
  })

  it('pins the codes the boundary decides on', () => {
    // If one of these moves, `FATAL_CODES` in vue-error-info.ts is deciding on
    // the wrong errors.
    expect(ErrorCodes.SETUP_FUNCTION).toBe(0)
    expect(ErrorCodes.RENDER_FUNCTION).toBe(1)
    expect(ErrorCodes.ASYNC_COMPONENT_LOADER).toBe(13)
    expect(ErrorCodes.COMPONENT_UPDATE).toBe(15)
  })
})

/**
 * Everything above runs against the development build, where `info` is the
 * readable name. The URL form exists only in the production build, so these
 * tests load that build of the installed `@vue/runtime-core`, mount components
 * that fail on a renderer with no DOM behind it, and read what an
 * `errorCaptured` hook is actually handed. If Vue changes the shape of that
 * string, this is the test that says so.
 */
describe('what the production build of Vue passes', () => {
  interface FakeNode {
    children: FakeNode[]
    parent: FakeNode | null
  }
  type ProductionVue = typeof import('vue')

  const requireFromHere = createRequire(import.meta.url)
  const requireFromVue = createRequire(requireFromHere.resolve('vue'))
  const core = requireFromVue('@vue/runtime-core/dist/runtime-core.cjs.prod.js') as ProductionVue

  const node = (): FakeNode => ({ children: [], parent: null })
  const { createApp } = core.createRenderer<FakeNode, FakeNode>({
    insert(child, parent) {
      child.parent = parent
      parent.children.push(child)
    },
    remove(child) {
      const siblings = child.parent?.children
      if (siblings) siblings.splice(siblings.indexOf(child), 1)
    },
    createElement: node,
    createText: node,
    createComment: node,
    setText: () => undefined,
    setElementText: () => undefined,
    patchProp: () => undefined,
    parentNode: (child) => child.parent,
    nextSibling(child) {
      const siblings = child.parent?.children ?? []
      return siblings[siblings.indexOf(child) + 1] ?? null
    },
  })

  /** Mount `child` under a parent that records what its `errorCaptured` hook receives. */
  function infoFor(child: Vue.Component): unknown[] {
    const seen: unknown[] = []
    const parent = core.defineComponent({
      setup() {
        core.onErrorCaptured((_err, _instance, info) => {
          seen.push(info)
          return false
        })
        return () => core.h(child)
      },
    })
    createApp(parent).mount(node())
    return seen
  }

  it('really is the production build', () => {
    // The development build would pass 'setup function' and prove nothing.
    const [info] = infoFor({
      setup() {
        throw new Error('setup failed')
      },
    })
    expect(info).toBe(productionInfo(0))
  })

  it.each([
    [
      'a setup() that throws',
      {
        setup() {
          throw new Error('setup failed')
        },
      },
      { code: 0, name: 'setup function', fatal: true, fatalIfRepeated: false },
    ],
    [
      'a render function that throws',
      {
        render() {
          throw new Error('render failed')
        },
      },
      { code: 1, name: 'render function', fatal: false, fatalIfRepeated: true },
    ],
    [
      'a mounted hook that throws',
      {
        setup() {
          core.onMounted(() => {
            throw new Error('mounted failed')
          })
          return () => null
        },
      },
      { code: 'm', name: 'mounted hook', fatal: false, fatalIfRepeated: false },
    ],
    [
      'a watcher callback that throws',
      {
        setup() {
          const source = core.ref(0)
          core.watch(
            source,
            () => {
              throw new Error('watcher failed')
            },
            { flush: 'sync' },
          )
          source.value++
          return () => null
        },
      },
      { code: 3, name: 'watcher callback', fatal: false, fatalIfRepeated: false },
    ],
  ] as Array<[string, Vue.Component, ReturnType<typeof parseVueErrorInfo>]>)(
    '%s is classified from the string production hands over',
    (_label, component, expected) => {
      const seen = infoFor(component)

      expect(seen).toHaveLength(1)
      expect(String(seen[0])).toMatch(/^https:\/\/vuejs\.org\/error-reference\/#runtime-/)
      expect(parseVueErrorInfo(seen[0])).toEqual(expected)
    },
  )
})

describe('which errors are fatal', () => {
  it.each([
    ['dev setup', 'setup function'],
    ['prod setup', productionInfo(0)],
    ['dev async component loader', 'async component loader'],
    ['prod async component loader', productionInfo(13)],
  ])('%s is fatal', (_label, info) => {
    expect(parseVueErrorInfo(info)).toMatchObject({ fatal: true, fatalIfRepeated: false })
  })

  it.each([
    ['dev render', 'render function'],
    ['prod render', productionInfo(1)],
    ['dev component update', 'component update'],
    ['prod component update', productionInfo(15)],
  ])('%s is recoverable once, fatal when repeated', (_label, info) => {
    expect(parseVueErrorInfo(info)).toMatchObject({ fatal: false, fatalIfRepeated: true })
  })

  it.each([
    'watcher getter',
    'watcher callback',
    'watcher cleanup function',
    'native event handler',
    'component event handler',
    'vnode hook',
    'directive hook',
    'transition hook',
    'ref function',
    'scheduler flush',
    'mounted hook',
    'beforeMount hook',
    'created hook',
    'updated',
    'unmounted hook',
    'errorCaptured hook',
  ])('"%s" never traps the UI', (info) => {
    expect(parseVueErrorInfo(info)).toMatchObject({ fatal: false, fatalIfRepeated: false })
  })

  it('treats production lifecycle hooks (short string keys) as recoverable', () => {
    for (const key of ['bm', 'm', 'bu', 'u', 'um', 'a', 'da', 'ec']) {
      expect(parseVueErrorInfo(productionInfo(key))).toMatchObject({
        fatal: false,
        fatalIfRepeated: false,
      })
      expect(parseVueErrorInfo(productionInfo(key)).code).toBe(key)
    }
  })
})

describe('input it does not recognise', () => {
  it.each([
    ['undefined', undefined],
    ['a number', 0],
    ['an empty string', ''],
    ['free text', 'something else entirely'],
    ['an unknown numeric code', productionInfo(999)],
    ['an inherited property name', productionInfo('constructor')],
    ['a different fragment', 'https://vuejs.org/error-reference/#warn-1'],
  ])('%s is unknown and not fatal', (_label, info) => {
    expect(parseVueErrorInfo(info)).toEqual({
      code: null,
      name: 'unknown',
      fatal: false,
      fatalIfRepeated: false,
    })
  })

  it('does not match a substring of a readable name', () => {
    // The old boundary tested `info.includes('async')`.
    expect(parseVueErrorInfo('async').fatal).toBe(false)
  })
})
