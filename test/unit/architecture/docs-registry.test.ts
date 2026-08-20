import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

/**
 * Every markdown page under `docs/` is reachable from the docs sidebar, and
 * carries the title its own frontmatter declares.
 *
 * `DocsShell.vue` maps file path → `{ title, navTitle, description }` by hand,
 * because `import.meta.glob` loads the markdown lazily and the sidebar has to
 * be built synchronously. That map is a registry, and registries here go stale
 * silently: nine pages had drifted out of it, and every one of them rendered in
 * the sidebar as a lowercased slug — "vercel demo", "route pages" — sitting
 * next to properly titled siblings. Two more were not in the sidebar at all.
 *
 * The frontmatter is the source of truth a writer edits; this asserts the map
 * still agrees with it.
 */

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, 'docs')
const SHELL = path.join(ROOT, 'src/modules/app/components/docs/DocsShell.vue')

function docsFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...docsFiles(full))
    else if (entry.name.endsWith('.md')) {
      found.push('/' + path.relative(ROOT, full).split(path.sep).join('/'))
    }
  }
  return found
}

function frontmatterTitle(docPath: string): string | undefined {
  const raw = fs.readFileSync(path.join(ROOT, docPath.slice(1)), 'utf8')
  const block = raw.match(/^---\n([\s\S]*?)\n---/)
  return block?.[1]?.match(/^title:\s*(.+)$/m)?.[1]?.trim()
}

const shellSource = fs.readFileSync(SHELL, 'utf8')

/**
 * The map is read from source rather than imported: importing `DocsShell.vue`
 * drags in `import.meta.glob`, Comark, and every demo component with it.
 */
const registry = new Map<string, { title?: string; navTitle?: string }>()
for (const match of shellSource.matchAll(
  /^ {2}'(\/docs\/[^']+)': \{\n((?: {4}.*\n|\n)*?) {2}\},$/gm,
)) {
  const body = match[2] ?? ''
  registry.set(match[1]!, {
    title: body.match(/^ {4}title: '(.*)',$/m)?.[1],
    navTitle: body.match(/^ {4}navTitle: '(.*)',$/m)?.[1],
  })
}

const files = docsFiles(DOCS_DIR).sort()

describe('docs sidebar registry', () => {
  it('parses the metadata map out of DocsShell.vue', () => {
    // A guard on the test itself: a formatting change to the map that broke the
    // regex would otherwise make every assertion below vacuously pass.
    expect(registry.size).toBeGreaterThan(30)
  })

  it.each(files)('%s is registered', (file) => {
    expect(
      registry.has(file),
      `${file} is missing from DOCS_MARKDOWN_METADATA in DocsShell.vue, so the ` +
        'sidebar will label it with a lowercased slug instead of its title.',
    ).toBe(true)
  })

  it.each(files)('%s agrees with its own frontmatter title', (file) => {
    const declared = frontmatterTitle(file)
    if (!declared) return
    expect(
      registry.get(file)?.title,
      `${file} declares "${declared}" in its frontmatter but DocsShell.vue says ` +
        `"${registry.get(file)?.title}". The sidebar shows the second one.`,
    ).toBe(declared)
  })

  it('registers nothing that no longer exists', () => {
    const orphans = [...registry.keys()].filter((entry) => !files.includes(entry))
    expect(orphans, `DocsShell.vue maps files that are gone: ${orphans.join(', ')}`).toEqual([])
  })
})
