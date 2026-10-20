import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// Importing the script must not run it: `isEntryPoint()` keeps the checks, the
// dist walk and their `process.exit()` behind a direct invocation.
import {
  chunkName,
  chunkNaming,
  chunksNamed,
  eagerFiles,
  emittedFileFor,
  hashLengthOf,
  isChunk,
  pageReferences,
  staticImports,
  // @ts-expect-error - the build scripts are plain ESM JavaScript with no type declarations.
} from '../../../scripts/build/verify-bundle.mjs'

/**
 * `verify-bundle.mjs` is the only gate that can see what a build shipped, so a
 * false positive in it is expensive twice: the build goes red for nothing, and
 * the next real failure gets rebuilt away as "that flaky check again".
 *
 * Its MSW check matched "msw" anywhere in a chunk's filename — content hash
 * included — and `register-WvaWmSwy.js` lowercases to "…wmswy". These tests pin
 * the name/hash split against real rolldown output, and run the script itself
 * against small fixture builds.
 */

const SCRIPT = path.join(process.cwd(), 'scripts/build/verify-bundle.mjs')

describe('chunkName', () => {
  it('strips the directory, the content hash and the extension', () => {
    expect(chunkName('assets/msw-vendor-e1wNtvZD.js')).toBe('msw-vendor')
    expect(chunkName('assets/register-WvaWmSwy.js')).toBe('register')
  })

  // All three are file names from a real build. The hash is base64url, so a
  // dash inside or at either end of it must not be read as the name separator.
  it('keeps names intact when the hash itself contains a dash', () => {
    expect(chunkName('assets/docs--8Mo5HM9.js')).toBe('docs')
    expect(chunkName('assets/1.overview-DlhRris-.js')).toBe('1.overview')
    expect(chunkName('assets/3.add-a-theme-CS1YJ-aE.js')).toBe('3.add-a-theme')
  })

  it('falls back to the whole basename for a file with no hash', () => {
    expect(chunkName('mockServiceWorker.js')).toBe('mockServiceWorker')
  })

  // `chunkFileNames: '[name]-[hash:12].js'` is a project's to set. Read with a
  // fixed eight, such a file kept its hash as part of its name: no name check
  // matched it, and a hash that spelled "msw" was an MSW chunk again.
  it('takes off a hash of the length the build emits', () => {
    expect(chunkName('assets/charts-vendor-CZBo_7NZAb12.js', 12)).toBe('charts-vendor')
    expect(chunkName('assets/docs--8Mo5HM9Ab12.js', 12)).toBe('docs')
    expect(chunkName('assets/register-WvaWmSwy.js', 12)).toBe('register-WvaWmSwy')
  })
})

describe('hashLengthOf', () => {
  it('reads eight off a build with the default file names', () => {
    expect(
      hashLengthOf([
        'assets/index-D5TFPTY5.js',
        'assets/docs--8Mo5HM9.js',
        'assets/1.overview-DlhRris-.js',
        'assets/3.add-a-theme-CS1YJ-aE.js',
        'assets/charts-vendor-CZBo_7NZ.js',
        'runtime-config.js',
        'mockServiceWorker.js',
      ]),
    ).toBe(8)
  })

  it('reads the length a project configured', () => {
    expect(
      hashLengthOf([
        'assets/index-D5TFPTY5Ab12.js',
        'assets/vue-vendor-BndbH7cv_-12.js',
        'assets/charts-vendor-CZBo_7NZAb12.js',
        'runtime-config.js',
      ]),
    ).toBe(12)
  })

  it('keeps the default where the files do not say', () => {
    expect(hashLengthOf(['assets/msw-vendor-e1wNtvZD.js'])).toBe(8)
    expect(hashLengthOf(['mockServiceWorker.js'])).toBe(8)
    expect(hashLengthOf([])).toBe(8)
  })
})

describe('isChunk', () => {
  it('finds a chunk by its whole name', () => {
    expect(isChunk('assets/charts-vendor-CZBo_7NZ.js', 'charts-vendor')).toBe(true)
    expect(isChunk('assets/comark-Coo580kt.js', 'comark')).toBe(true)
  })

  // What rolldown calls the parts of a group it split: `maxSize`, `entriesAware`.
  it('finds the numbered parts rolldown splits a group into', () => {
    expect(isChunk('assets/charts-vendor2-CZBo_7NZ.js', 'charts-vendor')).toBe(true)
    expect(isChunk('assets/comark12-Coo580kt.js', 'comark')).toBe(true)
  })

  it('finds it under a hash of another length', () => {
    expect(isChunk('assets/charts-vendor-CZBo_7NZAb12.js', 'charts-vendor', 12)).toBe(true)
    expect(isChunk('assets/charts-vendor2-CZBo_7NZAb12.js', 'charts-vendor', 12)).toBe(true)
  })

  it('finds it in a build whose file names carry no hash', () => {
    expect(isChunk('assets/charts-vendor.js', 'charts-vendor')).toBe(true)
    expect(isChunk('assets/charts-vendor2.js', 'charts-vendor')).toBe(true)
  })

  it('is not put off by a name that only looks like one', () => {
    expect(isChunk('assets/useDocsSidebar-Bvmb-p7n.js', 'docs-vendor')).toBe(false)
    expect(isChunk('assets/component-docs-BbqUMHK0.js', 'docs-vendor')).toBe(false)
    expect(isChunk('assets/4.charts-DLOfqENk.js', 'charts-vendor')).toBe(false)
    expect(isChunk('assets/charts-BTRx0yln.js', 'charts-vendor')).toBe(false)
    expect(isChunk('assets/charts-vendor-ui-BTRx0yln.js', 'charts-vendor')).toBe(false)
    expect(isChunk('assets/comark-utils-Coo580kt.js', 'comark')).toBe(false)
    expect(isChunk('assets/axes-D-dgo05B.js', 'axe')).toBe(false)
  })
})

describe('chunksNamed', () => {
  it('does not mistake a content hash that spells "msw" for an MSW chunk', () => {
    expect(chunksNamed(['assets/register-WvaWmSwy.js'], 'msw')).toEqual([])
  })

  it('finds the MSW vendor chunk by its name', () => {
    expect(chunksNamed(['assets/msw-vendor-XXXXXXXX.js'], 'msw')).toEqual([
      'assets/msw-vendor-XXXXXXXX.js',
    ])
  })

  it('ignores "msw" at every position a hash can hold it', () => {
    const files = [0, 1, 2, 3, 4, 5].map(
      (at) => `assets/register-${'AbCdE'.slice(0, at)}mSw${'AbCdE'.slice(at)}.js`,
    )
    expect(files.every((file) => chunkName(file) === 'register')).toBe(true)
    expect(chunksNamed(files, 'msw')).toEqual([])
  })

  it('matches whole words of the name, not letters that happen to line up', () => {
    const files = [
      'assets/itemsWidget-Ab12Cd34.js',
      'assets/useMswWorker-Ab12Cd34.js',
      'assets/MSWSetup-Ab12Cd34.js',
      'assets/formsWizard-Ab12Cd34.js',
    ]
    expect(chunksNamed(files, 'msw')).toEqual([
      'assets/useMswWorker-Ab12Cd34.js',
      'assets/MSWSetup-Ab12Cd34.js',
    ])
  })
})

describe('staticImports', () => {
  // Each form is how rolldown writes an import between two chunks, minified.
  it('reads every form of a static import between chunks', () => {
    const source =
      'import{n as e}from"./rolldown-runtime-Dd_uD5pT.js";' +
      'import"./side-effect-Ab12Cd34.js";' +
      'import t,{a as n}from"./vue-vendor-BndbH7cv.js";' +
      'import*as r from"./ns-Ab12Cd34.js";' +
      'export{i}from"./again-Ab12Cd34.js";' +
      'export*from"../up-Ab12Cd34.js";'

    expect(staticImports(source)).toEqual([
      './rolldown-runtime-Dd_uD5pT.js',
      './side-effect-Ab12Cd34.js',
      './vue-vendor-BndbH7cv.js',
      './ns-Ab12Cd34.js',
      './again-Ab12Cd34.js',
      '../up-Ab12Cd34.js',
    ])
  })

  // The difference this whole check rests on: `import()` is fetched when the
  // code reaches it, and Vite's preload helper names its files as plain strings.
  it('leaves out what is imported on demand', () => {
    const source =
      'import{t as e}from"./vue-vendor-BndbH7cv.js";' +
      'const a=()=>import("./charts-vendor-CZBo_7NZ.js");' +
      'const b=()=>e(()=>import("./echarts-setup-c60YD2B7.js"),__vite__mapDeps([0,1]));' +
      'const m=["assets/charts-vendor-CZBo_7NZ.js"];'

    expect(staticImports(source)).toEqual(['./vue-vendor-BndbH7cv.js'])
  })

  // Rolldown writes neither today. Both are valid, and a minifier may.
  it('reads a name given as a string, and past a comment ahead of the specifier', () => {
    const source =
      'import{"a-b"as e,\'from\'as f}from"./quoted-Ab12Cd34.js";' +
      'export{t as"default"}from"./exported-Ab12Cd34.js";' +
      'import/* side effect */"./commented-Ab12Cd34.js";' +
      'import{n}from/* @__PURE__ */"./after-from-Ab12Cd34.js";' +
      'import/* a */{/* b */r}/* c */from"./between-Ab12Cd34.js";'

    expect(staticImports(source)).toEqual([
      './quoted-Ab12Cd34.js',
      './exported-Ab12Cd34.js',
      './commented-Ab12Cd34.js',
      './after-from-Ab12Cd34.js',
      './between-Ab12Cd34.js',
    ])
  })

  // A string is a name only inside the braces. Read as one anywhere, the first
  // specifier here would be swallowed into the second statement's clause.
  it('keeps a bare import apart from the statement after it', () => {
    expect(staticImports('import"./a-Ab12Cd34.js"\nimport{b}from"./b-Ab12Cd34.js"')).toEqual([
      './a-Ab12Cd34.js',
      './b-Ab12Cd34.js',
    ])
    expect(staticImports('import/* x */("./lazy-Ab12Cd34.js")')).toEqual([])
  })
})

describe('pageReferences', () => {
  it('reads scripts, stylesheets and preloads, however the attribute is quoted', () => {
    const html =
      '<script src="/runtime-config.js"></script>' +
      "<script type='module' crossorigin src='/assets/index-D5TFPTY5.js'></script>" +
      '<link rel=modulepreload href=/assets/vue-vendor-BndbH7cv.js>' +
      '<link href="/assets/index-Bmppji-U.css" rel="stylesheet">' +
      '<LINK REL="preload" AS="font" HREF="/assets/inter-Ab12Cd34.woff2">'

    expect(pageReferences(html)).toEqual([
      '/runtime-config.js',
      '/assets/index-D5TFPTY5.js',
      '/assets/vue-vendor-BndbH7cv.js',
      '/assets/index-Bmppji-U.css',
      '/assets/inter-Ab12Cd34.woff2',
    ])
  })

  it('leaves out what the page does not wait for, and what is commented out', () => {
    const html =
      '<link rel="icon" href="/favicon.svg">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com">' +
      '<link rel="manifest" href="/site.webmanifest">' +
      '<!-- <script type="module" src="/assets/old-Ab12Cd34.js"></script> -->' +
      '<script>inline()</script>' +
      '<a href="/assets/brochure-Ab12Cd34.js">download</a>'

    expect(pageReferences(html)).toEqual([])
  })
})

describe('emittedFileFor', () => {
  const emitted = new Set(['assets/index-D5TFPTY5.js', 'static/js/app-Ab12Cd34.js', 'index.html'])

  it.each([
    ['an absolute path', '/assets/index-D5TFPTY5.js'],
    ['a subpath base', '/console/assets/index-D5TFPTY5.js'],
    ['a relative base', './assets/index-D5TFPTY5.js'],
    ['no leading slash', 'assets/index-D5TFPTY5.js'],
    ['a CDN base', 'https://cdn.example.com/app/v2/assets/index-D5TFPTY5.js'],
    ['a protocol-relative base', '//cdn.example.com/assets/index-D5TFPTY5.js'],
    ['a query and a fragment', '/assets/index-D5TFPTY5.js?v=3#top'],
  ])('finds the file behind %s', (_, url) => {
    expect(emittedFileFor(url, emitted)).toBe('assets/index-D5TFPTY5.js')
  })

  it('finds a file under another assetsDir, nested or not', () => {
    expect(emittedFileFor('/static/js/app-Ab12Cd34.js', emitted)).toBe('static/js/app-Ab12Cd34.js')
    expect(emittedFileFor('/console/static/js/app-Ab12Cd34.js', emitted)).toBe(
      'static/js/app-Ab12Cd34.js',
    )
  })

  it('finds nothing behind a URL of another site, or of a file that is not there', () => {
    expect(
      emittedFileFor('https://fonts.googleapis.com/css2?family=Inter', emitted),
    ).toBeUndefined()
    expect(emittedFileFor('/assets/index-XXXXXXXX.js', emitted)).toBeUndefined()
    expect(emittedFileFor('', emitted)).toBeUndefined()
  })
})

describe('eagerFiles', () => {
  const html = (...tags: string[]) => `<html><head>${tags.join('')}</head></html>`
  const ENTRY = '<script type="module" crossorigin src="/assets/index-D5TFPTY5.js"></script>'

  it('holds what index.html references and everything those chunks import statically', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'import"./vue-vendor-BndbH7cv.js";import("./page-Ab12Cd34.js")'],
      ['assets/vue-vendor-BndbH7cv.js', 'import"./rolldown-runtime-Dd_uD5pT.js";'],
      ['assets/rolldown-runtime-Dd_uD5pT.js', 'export{}'],
      ['assets/page-Ab12Cd34.js', 'import"./charts-vendor-CZBo_7NZ.js";'],
      ['assets/charts-vendor-CZBo_7NZ.js', 'export{}'],
    ])

    const loaded = eagerFiles(
      html(ENTRY, '<link rel="stylesheet" crossorigin href="/assets/index-Bmppji-U.css">'),
      sources,
      [...sources.keys(), 'assets/index-Bmppji-U.css'],
    )

    // No modulepreload link names them, and they are loaded all the same.
    expect([...loaded.keys()]).toEqual([
      'assets/index-D5TFPTY5.js',
      'assets/index-Bmppji-U.css',
      'assets/vue-vendor-BndbH7cv.js',
      'assets/rolldown-runtime-Dd_uD5pT.js',
    ])
    expect(loaded.get('assets/index-D5TFPTY5.js')).toEqual(['index.html'])
    expect(loaded.get('assets/vue-vendor-BndbH7cv.js')).toEqual(['assets/index-D5TFPTY5.js'])
  })

  it('names every chunk that asks for a file', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'import"./a-Ab12Cd34.js";import"./shared-Ab12Cd34.js";'],
      ['assets/a-Ab12Cd34.js', 'import"./shared-Ab12Cd34.js";'],
      ['assets/shared-Ab12Cd34.js', 'export{}'],
    ])

    const loaded = eagerFiles(
      html(ENTRY, '<link rel="modulepreload" crossorigin href="/assets/shared-Ab12Cd34.js">'),
      sources,
    )

    expect(loaded.get('assets/shared-Ab12Cd34.js')).toEqual([
      'index.html',
      'assets/index-D5TFPTY5.js',
      'assets/a-Ab12Cd34.js',
    ])
  })

  it('finds the assets of a build with a subpath base', () => {
    const loaded = eagerFiles(
      html(ENTRY.replace('/assets/', '/console/assets/')),
      new Map([['assets/index-D5TFPTY5.js', 'export{}']]),
    )

    expect([...loaded.keys()]).toEqual(['assets/index-D5TFPTY5.js'])
  })

  // Each of these gave an EMPTY list, and every check on what the page loads
  // then passed on nothing. vite.config.ts is the project's file, so `base` and
  // `build.assetsDir` are whatever the project made them.
  describe('whatever the build named its files', () => {
    const entryOf = (file: string) => new Map([[file, 'import"./vue-vendor-BndbH7cv.js"']])

    it('finds a reference with no leading slash', () => {
      const sources = new Map([
        ...entryOf('assets/index-D5TFPTY5.js'),
        ['assets/vue-vendor-BndbH7cv.js', 'export{}'],
      ])

      const loaded = eagerFiles(html(ENTRY.replace('"/assets/', '"assets/')), sources)

      expect([...loaded.keys()]).toEqual([
        'assets/index-D5TFPTY5.js',
        'assets/vue-vendor-BndbH7cv.js',
      ])
    })

    it.each([
      ['static', '/static/'],
      ['static/js', '/static/js/'],
      ['static, under a subpath base', '/console/static/'],
      ['static, on a CDN', 'https://cdn.example.com/app/static/'],
      ['the dist root', '/'],
    ])('finds the files of a build with assetsDir %s', (_, prefix) => {
      const dir = prefix.replace(/^https:\/\/[^/]+\/app\/|^\/console\/|^\//, '')
      const sources = new Map([
        ...entryOf(`${dir}index-D5TFPTY5.js`),
        [`${dir}vue-vendor-BndbH7cv.js`, 'export{}'],
      ])

      const loaded = eagerFiles(html(ENTRY.replace('/assets/', prefix)), sources)

      expect([...loaded.keys()]).toEqual([
        `${dir}index-D5TFPTY5.js`,
        `${dir}vue-vendor-BndbH7cv.js`,
      ])
    })

    it('reads attributes in single quotes, or in none', () => {
      const sources = new Map([
        ['assets/index-D5TFPTY5.js', 'export{}'],
        ['assets/shared-Ab12Cd34.js', 'export{}'],
      ])

      const loaded = eagerFiles(
        html(
          "<script type='module' crossorigin src='/assets/index-D5TFPTY5.js'></script>",
          '<link rel=modulepreload href=/assets/shared-Ab12Cd34.js>',
        ),
        sources,
      )

      expect([...loaded.keys()]).toEqual(['assets/index-D5TFPTY5.js', 'assets/shared-Ab12Cd34.js'])
    })

    it('is empty when index.html names nothing the build emitted', () => {
      const sources = new Map([['assets/index-D5TFPTY5.js', 'export{}']])

      expect(
        eagerFiles(html(ENTRY.replace('index-D5TFPTY5', 'index-XXXXXXXX')), sources).size,
      ).toBe(0)
      expect(eagerFiles(html(), sources).size).toBe(0)
    })
  })

  // A deployment's file, with a check of its own. Counted here, it would be
  // the one script of a page whose app could not be found.
  it('does not count the runtime configuration', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'export{}'],
      ['runtime-config.js', 'window.__VUESTRATA_RUNTIME__ ||= {}'],
    ])

    const loaded = eagerFiles(html('<script src="/runtime-config.js"></script>', ENTRY), sources)

    expect([...loaded.keys()]).toEqual(['assets/index-D5TFPTY5.js'])
  })

  // A docs page is a string in a chunk, and its code samples import things.
  it('follows only imports of files the build emitted', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'const doc="import { x } from \'./not-emitted.js\'";'],
    ])

    expect([...eagerFiles(html(ENTRY), sources).keys()]).toEqual(['assets/index-D5TFPTY5.js'])
  })
})

// Each test starts node, and a run that reaches the budgets loads tsx to read
// deploy.config.ts: slow on a busy machine, as for the header generator's CLI.
describe('verify-bundle.mjs', { timeout: 60_000 }, () => {
  let base: string
  let dist: string

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-verify-bundle-'))
    dist = path.join(base, 'dist')
  })

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true })
  })

  /** The page a build emits: the runtime configuration first, then the app. */
  const PAGE =
    '<!doctype html><html><head><script src="/runtime-config.js"></script>' +
    '<script type="module" crossorigin src="/assets/index-D5TFPTY5.js"></script></head>' +
    '<body><div id="app"></div></body></html>'

  /**
   * Write a fake build output: `assets/<file>` → chunk source, beside the page
   * and the runtime configuration every build has. `root` replaces or (with
   * `null`) removes one of those two.
   */
  function emit(
    chunks: Record<string, string>,
    root: Record<string, string | null> = {},
    assetsDir = 'assets',
  ) {
    fs.mkdirSync(path.join(dist, assetsDir), { recursive: true })
    for (const [file, source] of Object.entries(chunks)) {
      fs.writeFileSync(path.join(dist, assetsDir, file), source)
    }
    const files = {
      'index.html': PAGE,
      'runtime-config.js': 'window.__VUESTRATA_RUNTIME__ ||= {}\n',
      ...root,
    }
    for (const [file, source] of Object.entries(files)) {
      if (source !== null) fs.writeFileSync(path.join(dist, file), source)
    }
  }

  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      // The child inherits Vitest's NODE_ENV=test, under which consola prints
      // only warnings and errors. The assertions read the full report.
      env: { ...process.env, CONSOLA_LEVEL: '3' },
    })
    return {
      status: result.status,
      output: stripVTControlCharacters(`${result.stdout}${result.stderr}`),
    }
  }

  /**
   * A project root for `--root`: where the script reads `vite.config.ts` and
   * `deploy.config.ts` from. Without the flag it reads this repository's,
   * which is what every other test here runs against.
   */
  function project(files: Record<string, string> = {}) {
    const root = path.join(base, 'project')
    for (const [file, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), source)
    }
    fs.mkdirSync(root, { recursive: true })
    return `--root=${root}`
  }

  const DEPLOY_CONFIG = 'src/modules/app/config/deploy.config.ts'
  const withBundle = (bundle: unknown) =>
    project({ [DEPLOY_CONFIG]: `export default { bundle: ${JSON.stringify(bundle)} }\n` })

  // The flip side of the import above running nothing: invoked directly, the
  // script must still check. A guard that failed that way would exit 0 having
  // checked nothing, which is the one failure a gate must never have.
  it('runs its checks when invoked directly', () => {
    const { status, output } = run()
    expect(status).toBe(1)
    expect(output).toContain('Usage: verify-bundle.mjs')
  })

  it('passes a production build whose content hash spells "msw"', () => {
    emit({
      'index-D5TFPTY5.js': 'import "./register-WvaWmSwy.js"\n',
      'register-WvaWmSwy.js': 'export {}\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(output).toContain('no MSW chunk is emitted')
    expect(status).toBe(0)
  })

  it('fails a production build that emits the MSW vendor chunk', () => {
    emit({
      'index-D5TFPTY5.js': 'export {}\n',
      'msw-vendor-e1wNtvZD.js': 'export {}\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(status).toBe(1)
    expect(output).toContain('found assets/msw-vendor-e1wNtvZD.js')
  })

  // The in-app docs ship in a production build and are published at /docs, so
  // they get no exemption: a page quoting the demo account fails the build.
  it('searches documentation chunks for demo markers in production', () => {
    emit({
      'index-D5TFPTY5.js': 'export {}\n',
      '2.auth-rbac-BWc85eAj.js': 'export default "| `demo@vuestrata.dev` | `super_admin` |"\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(status).toBe(1)
    expect(output).toContain('"demo@vuestrata.dev" found in assets/2.auth-rbac-BWc85eAj.js')
  })

  // The charting engine was preloaded on every page for as long as the size
  // budget had room for it. This check names it, so the next one cannot hide.
  describe('chunks loaded on demand', () => {
    const CHECK = 'chunks loaded on demand are not loaded with the page'
    const preload = (file: string) =>
      PAGE.replace(
        '</head>',
        `<link rel="modulepreload" crossorigin href="/assets/${file}"></head>`,
      )

    it('passes a build that reaches the charting engine through import() alone', () => {
      emit({
        'index-D5TFPTY5.js':
          'import"./vue-vendor-BndbH7cv.js";const chart=()=>import("./BaseChart-BVvfkCNw.js")\n',
        'vue-vendor-BndbH7cv.js': 'export {}\n',
        'BaseChart-BVvfkCNw.js': 'import"./charts-vendor-CZBo_7NZ.js"\n',
        'charts-vendor-CZBo_7NZ.js': 'import"./vue-vendor-BndbH7cv.js"\n',
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain(CHECK)
      expect(status).toBe(0)
    })

    it('fails a build whose index.html preloads the charting chunk', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'export {}\n',
          'charts-vendor-B4UI2yDj.js': 'export {}\n',
        },
        { 'index.html': preload('charts-vendor-B4UI2yDj.js') },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(CHECK)
      expect(output).toContain(
        'assets/charts-vendor-B4UI2yDj.js (the charting engine) is in index.html',
      )
    })

    // The shape of the real defect: the Vue runtime was grouped into the chart
    // chunk, so the framework chunk imported it. No preload link is needed for
    // the browser to fetch it before the page renders.
    it('fails a build whose entry reaches it through static imports', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./vue-vendor-YRn28q9F.js"\n',
        'vue-vendor-YRn28q9F.js': 'import"./charts-vendor-B4UI2yDj.js"\n',
        'charts-vendor-B4UI2yDj.js': 'export {}\n',
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(
        'assets/charts-vendor-B4UI2yDj.js (the charting engine) is imported by ' +
          'assets/vue-vendor-YRn28q9F.js',
      )
      expect(output).toContain('see the codeSplitting comment in vite.config.ts')
    })

    it.each([
      ['docs-vendor-4rlSyRlv.js', 'the markdown and syntax-highlighting engine'],
      ['comark-Coo580kt.js', 'the docs renderer and its diagram engine'],
      ['axe-D-dgo05B.js', 'the accessibility checker'],
    ])('fails a build that preloads %s', (file, what) => {
      emit(
        { 'index-D5TFPTY5.js': 'export {}\n', [file]: 'export {}\n' },
        { 'index.html': preload(file) },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(`assets/${file} (${what}) is in index.html`)
    })

    it('fails a demo build that loads the mock backend with the page', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'import"./msw-vendor-e1wNtvZD.js"\n',
          'msw-vendor-e1wNtvZD.js': 'export {}\n',
        },
        { 'mockServiceWorker.js': '' },
      )

      const { status, output } = run('--mode=demo', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('assets/msw-vendor-e1wNtvZD.js (the mock backend) is imported by')
    })

    // Matched by the whole chunk name: these two are small, eager, and merely
    // have "docs" in their names.
    it('does not mistake a chunk that only shares a word with one', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'import"./useDocsSidebar-Bvmb-p7n.js"\n',
          'useDocsSidebar-Bvmb-p7n.js': 'export {}\n',
          'component-docs-BbqUMHK0.js': 'export {}\n',
        },
        { 'index.html': preload('component-docs-BbqUMHK0.js') },
      )

      expect(run('--mode=production', `--dist=${dist}`).status).toBe(0)
    })

    // A group with `maxSize` or `entriesAware` comes out in numbered parts.
    it.each([
      ['charts-vendor2-B4UI2yDj.js', 'the charting engine'],
      ['comark3-Coo580kt.js', 'the docs renderer and its diagram engine'],
    ])('fails a build that loads %s, a part rolldown split off', (file, what) => {
      emit({ 'index-D5TFPTY5.js': `import"./${file}"\n`, [file]: 'export {}\n' })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(`assets/${file} (${what}) is imported by assets/index-D5TFPTY5.js`)
    })

    it('fails a build with longer hashes that loads the charting chunk', () => {
      emit(
        {
          'index-D5TFPTY5Ab12.js': 'import"./charts-vendor-B4UI2yDjAb12.js"\n',
          'charts-vendor-B4UI2yDjAb12.js': 'import"./vue-vendor-BndbH7cvAb12.js"\n',
          'vue-vendor-BndbH7cvAb12.js': 'export {}\n',
        },
        { 'index.html': PAGE.replace('index-D5TFPTY5.js', 'index-D5TFPTY5Ab12.js') },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('assets/charts-vendor-B4UI2yDjAb12.js (the charting engine)')
    })

    // An upgraded project that kept its own `manualChunks` function fails this
    // check by construction, and its config has no codeSplitting comment.
    describe('says what to do about it', () => {
      const eagerCharts = () =>
        emit({
          'index-D5TFPTY5.js': 'import"./charts-vendor-B4UI2yDj.js"\n',
          'charts-vendor-B4UI2yDj.js': 'export {}\n',
        })

      const FUNCTION =
        'export default {\n  build: {\n    rolldownOptions: {\n      output: {\n' +
        "        manualChunks(id) {\n          if (id.includes('node_modules/echarts/')) return 'charts-vendor'\n" +
        '        },\n      },\n    },\n  },\n}\n'

      it('names the manualChunks function where the config still has one', () => {
        eagerCharts()

        const { status, output } = run(
          '--mode=production',
          `--dist=${dist}`,
          project({ 'vite.config.ts': FUNCTION }),
        )

        expect(status).toBe(1)
        expect(output).toContain(
          'vite.config.ts still names the vendor chunks with a manualChunks function',
        )
        expect(output).toContain('codeSplitting: { groups: [...] }')
        expect(output).toContain(
          'vue-vendor 30; ui-vendor and data-vendor 20; charts-vendor, docs-vendor and msw-vendor 10',
        )
        expect(output).toContain('UPGRADING.md')
        // Not sent to a comment its config does not have.
        expect(output).not.toContain('see the codeSplitting comment')
      })

      it('reads the config under the name the project gave it', () => {
        eagerCharts()

        const { output } = run(
          '--mode=production',
          `--dist=${dist}`,
          project({ 'vite.config.mjs': FUNCTION }),
        )

        expect(output).toContain(
          'vite.config.mjs still names the vendor chunks with a manualChunks function',
        )
      })

      it('says it conditionally where there is no config to read', () => {
        eagerCharts()

        const { status, output } = run('--mode=production', `--dist=${dist}`, project())

        expect(status).toBe(1)
        expect(output).toContain('see the codeSplitting comment in vite.config.ts')
        expect(output).toContain(
          'If the Vite config names the vendor chunks with a manualChunks function',
        )
        expect(output).toContain('UPGRADING.md')
      })

      it('says where to look when the config already has groups', () => {
        eagerCharts()

        // This repository's config: groups, with priorities.
        const { status, output } = run('--mode=production', `--dist=${dist}`)

        expect(status).toBe(1)
        expect(output).toContain('see the codeSplitting comment in vite.config.ts')
        expect(output).toContain('includeDependenciesRecursively: false')
        expect(output).not.toContain('manualChunks')
      })
    })
  })

  describe('chunkNaming', () => {
    const config = (output: string) =>
      `export default defineConfig({\n  build: {\n    rolldownOptions: {\n      output: {\n${output}      },\n    },\n  },\n})\n`

    it('recognises the function 1.0 shipped, as a method or as a property', () => {
      expect(
        chunkNaming(config('        manualChunks(id) {\n          return id\n        },\n')),
      ).toBe('function')
      expect(chunkNaming(config('        manualChunks: (id) => id,\n'))).toBe('function')
      expect(chunkNaming(config("        'manualChunks': chunkFor,\n"))).toBe('function')
      expect(
        chunkNaming('export default { build: { rolldownOptions: { output: { manualChunks } } } }'),
      ).toBe('function')
      expect(chunkNaming(config('        chunkFileNames: "[name].js",\n'))).toBeUndefined()
    })

    it('reads a config with groups as having groups, whatever else it keeps', () => {
      expect(chunkNaming(config('        codeSplitting: { groups: [] },\n'))).toBe('groups')
      expect(chunkNaming(config('        advancedChunks: { groups: [] },\n'))).toBe('groups')
      // Rolldown ignores the function once there are groups.
      expect(
        chunkNaming(
          config('        codeSplitting: { groups: [] },\n        manualChunks(id) {},\n'),
        ),
      ).toBe('groups')
    })

    it('reads declarations, not comments or strings that mention one', () => {
      expect(
        chunkNaming(
          config(
            '        // TODO: move to codeSplitting: { groups } one day\n' +
              '        /* codeSplitting: {} */\n' +
              '        manualChunks(id) {},\n',
          ),
        ),
      ).toBe('function')
      expect(
        chunkNaming(
          config(
            '        /**\n         * This used to be a `manualChunks(id)` function.\n         */\n' +
              "        banner: 'see https://rolldown.rs/reference',\n" +
              '        // manualChunks: gone\n',
          ),
        ),
      ).toBeUndefined()
      expect(chunkNaming(fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8'))).toBe(
        'groups',
      )
    })
  })

  // Everything about the page's size and its on-demand chunks is measured on
  // the files index.html loads. When none was found, those checks all passed,
  // on nothing, and the report said "0 files".
  describe('what the page loads', () => {
    const LOADS = 'index.html loads scripts this build emitted'
    const eagerCharts = (entry: string) => ({
      [entry]: 'import"./charts-vendor-B4UI2yDj.js"\n',
      'charts-vendor-B4UI2yDj.js': 'export {}\n',
    })

    it('is measured when index.html has no leading slash on its references', () => {
      emit(eagerCharts('index-D5TFPTY5.js'), {
        'index.html': PAGE.replace('"/assets/', '"assets/'),
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('assets/charts-vendor-B4UI2yDj.js (the charting engine)')
      expect(output).toMatch(/Initial payload: .* 2 files/)
    })

    it('is measured in a build with another assetsDir', () => {
      emit(
        eagerCharts('index-D5TFPTY5.js'),
        { 'index.html': PAGE.replace('/assets/', '/static/') },
        'static',
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('static/charts-vendor-B4UI2yDj.js (the charting engine)')
      expect(output).toMatch(/Initial payload: .* 2 files/)
    })

    it('is measured when index.html quotes its attributes with single quotes', () => {
      emit(eagerCharts('index-D5TFPTY5.js'), {
        'index.html': PAGE.replace(
          '<script type="module" crossorigin src="/assets/index-D5TFPTY5.js">',
          "<script type='module' crossorigin src='/assets/index-D5TFPTY5.js'>",
        ),
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('assets/charts-vendor-B4UI2yDj.js (the charting engine)')
    })

    it('passes a build whose files are found', () => {
      emit(
        { 'index-D5TFPTY5.js': 'export {}\n' },
        { 'index.html': PAGE.replace('/assets/', '/static/') },
        'static',
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain(LOADS)
      expect(output).toMatch(/Initial payload: .* 1 files/)
      expect(status).toBe(0)
    })

    it.each([
      [
        'index.html names a script the build did not emit',
        PAGE.replace('index-D5TFPTY5.js', 'index-XXXXXXXX.js'),
        /it names \/assets\/index-XXXXXXXX\.js, and none of those is a \.js file under/,
      ],
      [
        'index.html loads no script at all',
        PAGE.replace(/<script type="module"[^>]*><\/script>/, ''),
        /apart from runtime-config\.js, it has no <script src>, stylesheet or preload/,
      ],
      [
        'index.html loads a stylesheet and nothing else',
        PAGE.replace(
          /<script type="module"[^>]*><\/script>/,
          '<link rel="stylesheet" href="/assets/index-Bmppji-U.css">',
        ),
        /it names \/assets\/index-Bmppji-U\.css, and none of those is a \.js file under/,
      ],
    ])('fails when %s', (_, page, message) => {
      emit(
        { ...eagerCharts('index-D5TFPTY5.js'), 'index-Bmppji-U.css': '.a{color:red}' },
        { 'index.html': page },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(LOADS)
      expect(output).toMatch(message)
      expect(output).toContain('were NOT run')
      // Nothing is reported as measured, and nothing as within its budget.
      expect(output).not.toContain('Initial payload')
      expect(output).not.toContain('initial payload within')
      expect(output).not.toContain('chunks loaded on demand are not loaded with the page')
    })
  })

  describe('the size budgets', () => {
    /** `kb` kilobytes that gzip cannot shrink much, as a chunk. */
    const noise = (kb: number) =>
      `export default "${crypto.randomBytes(Math.ceil((kb * 1024 * 3) / 4)).toString('base64')}"\n`

    // The sizes are far past the budgets on purpose: these tests are about what
    // is measured, and should not need editing when a budget moves.
    it('counts what the entry imports statically, preloaded or not', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./a-Ab12Cd34.js";import"./b-Ab12Cd34.js"\n',
        'a-Ab12Cd34.js': noise(1024),
        'b-Ab12Cd34.js': noise(1024),
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(/KB gzipped \(2048\.\d KB raw\) across 3 files — over budget by/)
    })

    it('holds the largest chunk the page loads to its budget, and no lazy one', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./ui-vendor-Cwx1-IbK.js";import("./lazy-Coo580kt.js")\n',
        'ui-vendor-Cwx1-IbK.js': `export default "${'a'.repeat(2048 * 1024)}"\n`,
        'lazy-Coo580kt.js': `export default "${'a'.repeat(4096 * 1024)}"\n`,
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(
        /assets\/ui-vendor-Cwx1-IbK\.js is 2048\.\d KB and is loaded on every page/,
      )
      expect(output).not.toMatch(/lazy-Coo580kt\.js is/)
    })

    // The stylesheet is larger raw than any chunk the page loads. It counts
    // towards the payload, gzipped, and is not a chunk.
    it('does not hold the stylesheet to the chunk budget', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'export {}\n',
          'index-Bmppji-U.css': `.a{color:red}`.repeat(50_000),
        },
        {
          'index.html': PAGE.replace(
            '</head>',
            '<link rel="stylesheet" crossorigin href="/assets/index-Bmppji-U.css"></head>',
          ),
        },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain('2 files (largest chunk: assets/index-D5TFPTY5.js')
      expect(output).toMatch(/largest stylesheet: assets\/index-Bmppji-U\.css 634\.\d KB\)/)
      expect(status).toBe(0)
    })

    const withStylesheet = (file: string) =>
      PAGE.replace('</head>', `<link rel="stylesheet" crossorigin href="/assets/${file}"></head>`)

    // CSS is repetitive: 5 MB of it is 10 KB gzipped, which the payload budget
    // does not notice. The browser parses all 5 MB before it paints.
    it('holds the stylesheet to a raw budget of its own', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'export {}\n',
          'index-Bmppji-U.css': `.a{color:red}`.repeat(400_000),
        },
        { 'index.html': withStylesheet('index-Bmppji-U.css') },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(
        /assets\/index-Bmppji-U\.css is 5078\.\d KB and is loaded on every page/,
      )
      // The budget this one closes the gap in still passes.
      expect(output).not.toMatch(/over budget by/)
    })

    it('holds the largest stylesheet the page loads, and no lazy one', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'const page=()=>import("./lazy-Coo580kt.js")\n',
          'index-Bmppji-U.css': '.a{color:red}',
          'lazy-B4p0e8LE.css': `.a{color:red}`.repeat(400_000),
        },
        { 'index.html': withStylesheet('index-Bmppji-U.css') },
      )

      expect(run('--mode=production', `--dist=${dist}`).status).toBe(0)
    })
  })

  // A project whose own modules weigh more, or that draws a chart on every
  // page, used to have one way to say so: edit this managed script, and lose
  // every later version of it. It says so in its own deploy.config.ts now.
  describe('the budgets a project sets in deploy.config.ts', () => {
    /** `kb` kilobytes that gzip cannot shrink much, as a chunk. */
    const noise = (kb: number) =>
      `export default "${crypto.randomBytes(Math.ceil((kb * 1024 * 3) / 4)).toString('base64')}"\n`

    /**
     * A page of about 590 KB gzipped (base64 noise compresses to three
     * quarters): over the default payload budget of 560, under 620, in two
     * chunks that are each under the chunk budget.
     */
    const heavyPage = () =>
      emit({
        'index-D5TFPTY5.js': 'import"./a-Ab12Cd34.js";import"./b-Ab12Cd34.js"\n',
        'a-Ab12Cd34.js': noise(390),
        'b-Ab12Cd34.js': noise(390),
      })

    it('fails the heavy page on the defaults', () => {
      heavyPage()

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('initial payload within 560.0 KB gzipped')
    })

    it('passes it on a budget the project raised, and prints the raise', () => {
      heavyPage()

      const { status, output } = run(
        '--mode=production',
        `--dist=${dist}`,
        withBundle({ initialPayloadGzipKb: 620, totalJsKb: 8192 }),
      )

      expect(output).toContain(
        'initial payload budget 620.0 KB (default 560.0 KB, from deploy.config.ts)',
      )
      expect(output).toContain(
        'total JS budget 8192.0 KB (default 7168.0 KB, from deploy.config.ts)',
      )
      expect(output).toContain('initial payload within 620.0 KB gzipped')
      expect(output).toContain('total JS within 8192.0 KB')
      // The two it left alone keep their defaults, without a word.
      expect(output).toContain('largest eagerly-loaded chunk within 400.0 KB')
      expect(output).toContain('largest eagerly-loaded stylesheet within 700.0 KB')
      expect(output).not.toMatch(/largest eager (?:chunk|stylesheet) budget/)
      expect(status).toBe(0)
    })

    it('holds a build to a budget the project lowered', () => {
      emit({ 'index-D5TFPTY5.js': noise(64) })

      const { status, output } = run(
        '--mode=production',
        `--dist=${dist}`,
        withBundle({ largestEagerChunkKb: 32, largestEagerStylesheetKb: 100.5 }),
      )

      expect(status).toBe(1)
      expect(output).toContain('largest eager chunk budget 32.0 KB (default 400.0 KB, from')
      expect(output).toContain('largest eager stylesheet budget 100.5 KB (default 700.0 KB, from')
      expect(output).toMatch(/assets\/index-D5TFPTY5\.js is 64\.\d KB and is loaded on every page/)
    })

    it('stops checking a chunk the project loads with every page by design', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./charts-vendor-B4UI2yDj.js"\n',
        'charts-vendor-B4UI2yDj.js': 'export {}\n',
      })

      const { status, output } = run(
        '--mode=production',
        `--dist=${dist}`,
        withBundle({ onDemandChunks: { remove: ['charts-vendor'] } }),
      )

      expect(output).toContain(
        'on-demand chunk charts-vendor is not checked (removed in deploy.config.ts)',
      )
      expect(status).toBe(0)
    })

    it('checks a chunk the project added, and still the ones it did not remove', () => {
      const added = withBundle({ onDemandChunks: { add: ['maps-vendor'] } })

      emit({
        'index-D5TFPTY5.js': 'import"./maps-vendor-B4UI2yDj.js"\n',
        'maps-vendor-B4UI2yDj.js': 'export {}\n',
      })
      const maps = run('--mode=production', `--dist=${dist}`, added)
      expect(maps.status).toBe(1)
      expect(maps.output).toContain(
        'on-demand chunk maps-vendor is checked as well (added in deploy.config.ts)',
      )
      expect(maps.output).toContain(
        'assets/maps-vendor-B4UI2yDj.js (declared on demand in deploy.config.ts) is imported by',
      )

      emit({
        'index-D5TFPTY5.js': 'import"./docs-vendor-B4UI2yDj.js"\n',
        'docs-vendor-B4UI2yDj.js': 'export {}\n',
      })
      const docs = run('--mode=production', `--dist=${dist}`, added)
      expect(docs.status).toBe(1)
      expect(docs.output).toContain('assets/docs-vendor-B4UI2yDj.js (the markdown and')
    })

    it.each([
      [{ initialPayloadGzipKb: '620' }, 'bundle.initialPayloadGzipKb: "620" is not a size'],
      [{ totalJsKb: -1 }, 'bundle.totalJsKb: -1 is not a size'],
      [{ initialPayloadKb: 620 }, 'bundle.initialPayloadKb: unknown option'],
      [
        { onDemandChunks: { remove: ['chart-vendor'] } },
        'bundle.onDemandChunks.remove: "chart-vendor" is not a chunk the check looks for',
      ],
    ])('fails on %j, naming the file and the key', (bundle, problem) => {
      heavyPage()

      const { status, output } = run('--mode=production', `--dist=${dist}`, withBundle(bundle))

      expect(status).toBe(1)
      expect(output).toContain(`the bundle settings in ${DEPLOY_CONFIG} are valid`)
      expect(output).toContain(`Invalid \`bundle\` in ${DEPLOY_CONFIG}`)
      expect(output).toContain(problem)
      // The rest of the build is still checked, against the defaults.
      expect(output).toContain('initial payload within 560.0 KB gzipped')
    })

    it('runs on the defaults, and says so once, in a project without the file', () => {
      heavyPage()

      const { status, output } = run('--mode=production', `--dist=${dist}`, project())

      expect(status).toBe(1)
      expect(
        output.split(`${DEPLOY_CONFIG} is not in this project: the default budgets apply.`),
      ).toHaveLength(2)
      expect(output).toContain('initial payload within 560.0 KB gzipped')
    })

    it('runs on the defaults, and says so once, when the file cannot be loaded', () => {
      heavyPage()

      const { status, output } = run(
        '--mode=production',
        `--dist=${dist}`,
        project({ [DEPLOY_CONFIG]: 'export default defineDeployConfig({ bundle: \n' }),
      )

      expect(status).toBe(1)
      expect(output).toMatch(/Could not load .*deploy\.config\.ts/)
      expect(output.split('The default budgets apply.')).toHaveLength(2)
      expect(output).toContain('initial payload within 560.0 KB gzipped')
    })

    it('adds shipped query and table chunk guards with the declared size budgets', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./vue-vendor-BndbH7cv.js"\n',
        'vue-vendor-BndbH7cv.js': 'export {}\n',
      })
      expect(
        fs
          .readFileSync(path.join(process.cwd(), DEPLOY_CONFIG), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ''),
      ).toContain('onDemandChunks:')

      const shipped = run('--mode=production', `--dist=${dist}`)
      const empty = run(
        '--mode=production',
        `--dist=${dist}`,
        project({ [DEPLOY_CONFIG]: 'export default {}\n' }),
      )

      expect(shipped.status).toBe(0)
      expect(empty.status).toBe(0)
      expect(shipped.output).toContain('on-demand chunk collection-queries is checked as well')
      expect(shipped.output).toContain('on-demand chunk tables-vendor is checked as well')
      for (const check of [
        'initial payload within 560.0 KB gzipped',
        'largest eagerly-loaded chunk within 400.0 KB',
        'largest eagerly-loaded stylesheet within 700.0 KB',
        'total JS within 7680.0 KB',
        'Bundle verification passed for --mode=production (17 checks).',
      ]) {
        expect(shipped.output).toContain(check)
      }
    })

    it('rejects the collection query factory being pulled into startup', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./collection-queries-B4UI2yDj.js"\n',
        'collection-queries-B4UI2yDj.js': 'export {}\n',
      })
      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('collection-queries-B4UI2yDj.js')
      expect(output).toContain('chunks loaded on demand are not loaded with the page')
    })

    it('rejects the native table engine being pulled into startup', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./tables-vendor-B4UI2yDj.js"\n',
        'tables-vendor-B4UI2yDj.js': 'export {}\n',
      })
      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('tables-vendor-B4UI2yDj.js')
      expect(output).toContain('chunks loaded on demand are not loaded with the page')
    })
  })

  // One build serves every environment only while runtime-config.js stays a
  // file of its own that the page loads first.
  describe('the runtime configuration', () => {
    const chunks = { 'index-D5TFPTY5.js': 'export {}\n' }
    const CHECK = 'the runtime configuration is its own file, loaded before the app'

    it('passes a build that loads it as a separate script before the app', () => {
      emit(chunks)

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain(CHECK)
      expect(status).toBe(0)
    })

    it.each([
      ['the file is missing from the build', { 'runtime-config.js': null }, /is missing/],
      [
        'the page does not load it',
        { 'index.html': PAGE.replace('<script src="/runtime-config.js"></script>', '') },
        /does not load runtime-config\.js/,
      ],
      [
        'it was inlined into the page',
        {
          'index.html': PAGE.replace(
            '<script src="/runtime-config.js"></script>',
            '<script>window.__VUESTRATA_RUNTIME__ ||= {}</script>',
          ),
        },
        /does not load runtime-config\.js/,
      ],
      [
        'the page also assigns the overlay inline',
        { 'index.html': PAGE.replace('<body>', '<body><script>__VUESTRATA_RUNTIME__={}</script>') },
        /assigns __VUESTRATA_RUNTIME__ inline/,
      ],
      [
        'it is loaded as a module',
        { 'index.html': PAGE.replace('<script src=', '<script type="module" src=') },
        /plain blocking script/,
      ],
      [
        'it is deferred',
        { 'index.html': PAGE.replace('<script src=', '<script defer src=') },
        /plain blocking script/,
      ],
      [
        'it comes after the app',
        {
          'index.html': PAGE.replace('<script src="/runtime-config.js"></script>', '').replace(
            '</head>',
            '<script src="/runtime-config.js"></script></head>',
          ),
        },
        /loaded after the app/,
      ],
    ])('fails when %s', (_, root, message) => {
      emit(chunks, root)

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(message)
    })

    it('accepts a subpath base', () => {
      emit(chunks, {
        'index.html': PAGE.replaceAll('"/runtime-config.js"', '"/console/runtime-config.js"'),
      })

      expect(run('--mode=production', `--dist=${dist}`).status).toBe(0)
    })
  })
})
