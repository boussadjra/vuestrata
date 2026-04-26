import fs from 'node:fs'
import path from 'node:path'

export function inlineVueHandlersPlugin() {
  return {
    name: 'inline-vue-handlers',
    check({ root, logger }) {
      const targetDir = path.join(root, 'src', 'modules', 'app')
      const files = walkVueFiles(targetDir)
      const violations = []

      for (const filePath of files) {
        const fileViolations = findViolations(filePath)
        for (const v of fileViolations) {
          violations.push({
            file: path.relative(root, filePath).replaceAll('\\\\', '/'),
            ...v,
          })
        }
      }

      if (violations.length > 0) {
        logger.error(
          'Inline multiline Vue event handlers are not allowed. Use named methods instead.',
        )
        for (const v of violations) {
          logger.error(`- ${v.file}:${v.line} (@${v.event})`)
        }
        return {
          ok: false,
          message: `${violations.length} inline event handler violation(s) found`,
        }
      }

      logger.success('No multiline inline Vue event handlers found.')
      return { ok: true }
    },
  }
}

function walkVueFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkVueFiles(full, acc)
      continue
    }
    if (entry.isFile() && full.endsWith('.vue')) {
      acc.push(full)
    }
  }
  return acc
}

function findViolations(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const violations = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    // Match either single- or double-quoted handlers; the previous regex
    // only caught double quotes, letting `@click='...'` slip through.
    const match = line.match(/@([\w.-]+)\s*=\s*(["'])/)
    if (!match) continue

    const quote = match[2]
    const quoteStart = line.indexOf(quote, match.index)
    const quoteEnd = line.indexOf(quote, quoteStart + 1)
    if (quoteStart !== -1 && quoteEnd !== -1) continue

    let j = i + 1
    while (j < lines.length && !lines[j].includes(quote)) {
      j++
    }

    violations.push({
      line: i + 1,
      event: match[1],
    })
  }

  return violations
}
