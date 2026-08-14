import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

const here = dirname(fileURLToPath(import.meta.url))
const semantic = readFileSync(join(here, '../../../src/modules/app/styles/semantic.css'), 'utf8')

describe('semantic token contract', () => {
  it('does not hardcode #ffffff for card or primary-foreground', () => {
    expect(semantic).not.toMatch(/--color-card:\s*#fff(?:fff)?\s*;/i)
    expect(semantic).not.toMatch(/--color-primary-foreground:\s*#fff(?:fff)?\s*;/i)
    expect(semantic).toMatch(/--color-card:\s*oklch\(from var\(--color-surface-50\)/)
    expect(semantic).toMatch(/--color-primary-foreground:\s*oklch\(from var\(--color-surface-50\)/)
  })

  it('declares chart slots on :root so canvas reads survive unused @theme keys', () => {
    const rootBlock = semantic.match(/\n:root \{\n([\s\S]*?)\n\}/)
    expect(rootBlock).toBeTruthy()
    for (let slot = 1; slot <= 8; slot += 1) {
      expect(rootBlock![1]).toContain(`--color-chart-${slot}:`)
    }
  })
})
