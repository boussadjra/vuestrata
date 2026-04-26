import type { ComarkPlugin, MarkdownItPlugin } from 'comark'

export interface DocsMermaidOptions {
  theme?: string
  themeDark?: string
}

interface MarkdownToken {
  type: string
  tag: string
  info?: string
  content?: string
  attrJoin: (name: string, value: string) => void
  attrSet: (name: string, value: string) => void
}

interface MarkdownState {
  tokens: MarkdownToken[]
}

function readFenceProps(
  content: string,
  index = 0,
): { props: Array<[string, string]>; index: number } | undefined {
  const bracketPairs: Record<string, string> = {
    '[': ']',
    '{': '}',
    '(': ')',
  }
  const quotePairs: Record<string, string> = {
    "'": "'",
    '"': '"',
    '`': '`',
  }

  if (content[index] !== '{') return undefined
  if (content[index + 1] === '{') return undefined

  const props: Array<[string, string]> = []
  let cursor = index + 1

  function readUntil(chars: string): string {
    const start = cursor
    while (cursor < content.length) {
      cursor += 1
      if (content[cursor] === '\\') cursor += 2
      if (chars.includes(content[cursor] ?? '')) break
    }
    return content.slice(start, cursor)
  }

  function readString(end: string) {
    readUntil(end)
  }

  function readBracket(end: string) {
    while (cursor < content.length) {
      cursor += 1
      const char = content[cursor]
      if (char && char in quotePairs) readString(quotePairs[char]!)
      else if (char && char in bracketPairs) readBracket(bracketPairs[char]!)
      else if (char === end) return
    }
  }

  function readValue(): string {
    const start = cursor
    const char = content[cursor]
    if (char && char in bracketPairs) {
      readBracket(bracketPairs[char]!)
      cursor += 1
      return content.slice(start, cursor)
    }
    if (char && char in quotePairs) {
      readString(quotePairs[char]!)
      cursor += 1
      return content.slice(start, cursor)
    }
    return readUntil(' }')
  }

  while (cursor < content.length) {
    const char = content[cursor]
    if (char === '\\') cursor += 2
    else if (char === '}') {
      cursor += 1
      break
    } else if (char === ' ') cursor += 1
    else if (char === '.') {
      cursor += 1
      props.push(['class', readUntil(' #.}')])
    } else if (char === '#') {
      cursor += 1
      props.push(['id', readUntil(' #.}')])
    } else {
      const start = cursor
      while (cursor < content.length) {
        cursor += 1
        if (' }='.includes(content[cursor] ?? '')) break
      }

      if (start !== cursor) {
        const key = content.slice(start, cursor).trim()
        if (content[cursor] === '=') {
          cursor += 1
          props.push([key, readValue()])
        } else props.push([key, 'true'])
      }
    }
  }

  return {
    props: props.map(([key, value]) => [
      key,
      value.match(/^(['"`]).*\1$/) ? value.slice(1, -1) : value,
    ]),
    index: cursor,
  }
}

function createMarkdownItMermaid(options: DocsMermaidOptions): MarkdownItPlugin {
  return (md) => {
    md.core.ruler.after('block', 'vuestrata-mermaid', (state: MarkdownState) => {
      for (const token of state.tokens) {
        const rawInfo = token.info?.trim() ?? ''
        if (token.type !== 'fence' || !/^mermaid(?:\s|$|\{)/.test(rawInfo)) continue

        let info = rawInfo.slice('mermaid'.length).trim()
        const propsStart = info.indexOf('{')

        if (propsStart !== -1) {
          const result = readFenceProps(info.slice(propsStart))
          if (result) {
            for (const [key, value] of result.props) token.attrJoin(key, value)
            info = info.slice(propsStart + result.index).trim()
          }
        }

        token.type = 'mermaid'
        token.tag = 'mermaid'
        token.info = info
        token.attrSet('content', token.content ?? '')

        if (options.theme) token.attrSet('theme', options.theme)
        if (options.themeDark) token.attrSet('theme-dark', options.themeDark)
      }
    })
  }
}

export default function mermaid(options: DocsMermaidOptions = {}): ComarkPlugin {
  return {
    name: 'mermaid',
    markdownItPlugins: [createMarkdownItMermaid(options)],
  }
}
