import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { compileScript, parse, registerTS } from '@vue/compiler-sfc'

/**
 * The props and emits a `Ui*` component actually accepts.
 *
 * Compiled rather than pattern-matched: props reach these components four ways
 * — a named interface, an inline type, an imported one, and an intersection of
 * the last two — and a regex handling the first two reported thirty-two
 * components as having no props at all.
 */

const require = createRequire(import.meta.url)

// compiler-sfc loads TypeScript lazily and cannot find it under pnpm's strict
// layout, without which every aliased type import fails to resolve.
registerTS(() => require('typescript'))

const APP_DIR = path.resolve(process.cwd(), 'src/modules/app')

/** `@/composables/forms` and `~/types` both point at the app module. */
function resolveAlias(candidate: string): string {
  const normalized = candidate.split(path.sep).join('/')
  const match = /[@~]\/(.*)$/.exec(normalized)
  return match ? path.join(APP_DIR, match[1]!) : candidate
}

const fsShim = {
  fileExists: (file: string) => fs.existsSync(resolveAlias(file)),
  readFile: (file: string) => {
    try {
      return fs.readFileSync(resolveAlias(file), 'utf8')
    } catch {
      return undefined
    }
  },
  realpath: (file: string) => resolveAlias(file),
}

export interface ComponentSurface {
  props: string[]
  emits: string[]
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

export function readComponentSurface(file: string): ComponentSurface {
  const source = fs.readFileSync(file, 'utf8')
  const { descriptor } = parse(source, { filename: path.basename(file) })
  const compiled = compileScript(descriptor, { id: path.basename(file), fs: fsShim })

  const propsBlock = /props: \{[\s\S]*?\n {2}\},?\n/.exec(compiled.content)?.[0] ?? ''
  const props = [...propsBlock.matchAll(/^ {4}(\w+):/gm)].map(([, name]) => name!)

  const emitsBlock = /emits: \[([^\]]*)\]/.exec(compiled.content)?.[1] ?? ''
  const emits = [...emitsBlock.matchAll(/"([^"]+)"/g)].map(([, name]) => name!)

  return { props: sorted(props), emits: sorted(emits) }
}

/** Every `*.vue` in a directory, keyed by component name. */
export function readDirectorySurface(dir: string): Record<string, ComponentSurface> {
  const surface: Record<string, ComponentSurface> = {}

  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.vue'))) {
    surface[file.replace(/\.vue$/, '')] = readComponentSurface(path.join(dir, file))
  }

  return surface
}
