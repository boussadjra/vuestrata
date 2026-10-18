import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { foundationSnippets } from '@/components/home/snippets'

describe('home preview source excerpts', () => {
  it.each(Object.entries(foundationSnippets))(
    '%s matches its contiguous source lines',
    (_, snippet) => {
      const source = fs
        .readFileSync(path.join(process.cwd(), snippet.sourcePath), 'utf8')
        .replaceAll('\r\n', '\n')
        .split('\n')
      const displayed = snippet.lines.map((line) => line.map((part) => part.text).join(''))

      expect(displayed.join('\n')).toBe(
        source.slice(snippet.startLine - 1, snippet.startLine - 1 + displayed.length).join('\n'),
      )
    },
  )
})
