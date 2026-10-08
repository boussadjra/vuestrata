import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { parseUser } from '@/lib/auth/user'
import { parseAppEnv } from '@/lib/config/deploy'
import { describeEnvValueIssue, resolveRuntimeEnv } from '@/lib/config/env.schema'
import { AppError } from '@/lib/errors'
import { IN_ZODS_OWN_WORDS, safeParseForDiagnostics } from '@/lib/validation/diagnostics'
import { getI18n } from '@/plugins/i18n'

/**
 * What a developer reads stays in zod's own English.
 *
 * The app installs its `validation.*` catalog as zod's global error map, for
 * forms. Zod also checks responses, the user a backend sends and a
 * deployment's configuration, and what it says about those goes to devtools
 * and the error reporter, where a localized "Please enter a valid value" (or
 * its Arabic) says nothing.
 */

const i18n = getI18n()
let removeMessages: () => void

beforeEach(() => {
  removeMessages = installValidationMessages()
  i18n.global.locale.value = 'ar'
})

afterEach(() => {
  removeMessages()
  i18n.global.locale.value = 'en'
})

const ARABIC = /[؀-ۿ]/

describe('with the localized messages installed and the app in Arabic', () => {
  it('a form’s schema speaks Arabic', () => {
    const result = z.object({ id: z.string(), email: z.email() }).safeParse({ id: 1, email: 'x' })

    const messages = result.error!.issues.map((issue) => issue.message)
    expect(messages).toHaveLength(2)
    for (const message of messages) expect(message).toMatch(ARABIC)
  })

  it('the same schema, parsed for a diagnostic, speaks zod’s English', () => {
    const schema = z.object({ id: z.string(), email: z.email() })

    const result = safeParseForDiagnostics(schema, { id: 1, email: 'x' })

    expect(result.error!.issues.map((issue) => issue.message)).toEqual([
      'Invalid input: expected string, received number',
      'Invalid email address',
    ])
  })

  it('a message the schema sets for itself still wins', () => {
    const result = safeParseForDiagnostics(z.string({ error: 'An id, please' }), 1)

    expect(result.error!.issues[0]!.message).toBe('An id, please')
  })

  it('a user the backend sent wrong is described in English', () => {
    let thrown: unknown
    try {
      parseUser({ id: {}, email: 42 })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AppError)
    const details = Object.values((thrown as AppError).details ?? {}).flat()
    expect(details.length).toBeGreaterThan(0)
    for (const message of details) {
      expect(message).not.toMatch(ARABIC)
      expect(message).toMatch(/expected|Invalid/)
    }
  })

  it('a deployment’s configuration is described in English', () => {
    expect(() =>
      parseAppEnv(
        { env: { VUESTRATA_PORT: z.coerce.number().int() } },
        { VUESTRATA_PORT: 'eighty' },
      ),
    ).toThrow(/expected number/)

    const reason = describeEnvValueIssue('VUESTRATA_RUNTIME_MODE', 'staging')
    expect(reason).toBeTypeOf('string')
    expect(reason).not.toMatch(ARABIC)

    const warnings: string[] = []
    resolveRuntimeEnv(
      { VUESTRATA_RUNTIME_MODE: 'staging' },
      { onWarn: (message: string) => warnings.push(message) },
    )
    expect(warnings.join('\n')).toContain('VUESTRATA_RUNTIME_MODE')
    expect(warnings.join('\n')).not.toMatch(ARABIC)
  })
})

// ─── No call site forgets ────────────────────────────────────────────────────

const root = process.cwd()

function sourcesUnder(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourcesUnder(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/** A zod parse: `.safeParse(…)` or `.parse(…)` on something that is not JSON, a date or a URL. */
const PARSE_CALL = /(?<!JSON|Date|URL|Number)\.(?:safeParse|parse)(?:Async)?\(/g

describe('every zod parse in core/lib and the bootstrap', () => {
  /**
   * The one place zod answers a user: the validation adapter a form calls
   * with the user's input. It must stay in the user's language.
   */
  const userFacing = new Set(['src/modules/core/lib/validation/adapters/zod.ts'])

  it('is made in zod’s own words, or is the one that answers a user', () => {
    const offenders: string[] = []
    const files = [
      ...sourcesUnder('src/modules/core/lib'),
      ...sourcesUnder('src/modules/app/bootstrap'),
    ]

    for (const file of files) {
      if (userFacing.has(file)) continue
      const lines = readFileSync(join(root, file), 'utf8').split('\n')
      lines.forEach((line, at) => {
        const code = line.trim()
        if (code.startsWith('*') || code.startsWith('/')) return
        if (!PARSE_CALL.test(code)) return
        PARSE_CALL.lastIndex = 0
        if (code.includes('IN_ZODS_OWN_WORDS')) return
        offenders.push(`${relative(root, join(root, file))}:${at + 1}: ${code}`)
      })
    }

    expect(offenders).toEqual([])
    expect(files.length).toBeGreaterThan(50)
  })

  it('goes through the one helper where the helper can be imported', () => {
    const parsesItself = (file: string) =>
      /\.safeParse\([^)]*IN_ZODS_OWN_WORDS/.test(readFileSync(join(root, file), 'utf8'))

    const direct = sourcesUnder('src/modules/core/lib').filter(parsesItself)

    // The helper, and the two files Node loads before any alias exists.
    expect(direct.sort()).toEqual([
      'src/modules/core/lib/config/deploy.ts',
      'src/modules/core/lib/config/env.schema.ts',
      'src/modules/core/lib/validation/diagnostics.ts',
    ])
    expect(IN_ZODS_OWN_WORDS.error).toBeTypeOf('function')
  })
})
