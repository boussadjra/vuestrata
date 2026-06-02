/* eslint-disable no-console */
/// <reference types="node" />
/**
 * Vuestrata Scaffold CLI
 *
 * Interactive script that lets developers pick a UI provider, icon provider,
 * theme, and validation adapter — then prunes all unused alternatives.
 *
 * Usage: pnpm scaffold
 */
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { fileURLToPath } from 'url'

// ─── Configuration ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const UI_PROVIDERS: Record<string, { folder: string; prefix: string; dep?: string }> = {
  reka: { folder: 'reka', prefix: 'Reka' },
  vuetify0: { folder: 'vuetify0', prefix: 'V0', dep: '@vuetify/v0' },
}

const ICON_PROVIDERS: Record<string, { mapFile: string; dep?: string }> = {
  solar: { mapFile: 'solar.ts', dep: '@iconify-json/solar' },
  lucide: { mapFile: 'lucide.ts', dep: '@iconify-json/lucide' },
  phosphor: { mapFile: 'phosphor.ts', dep: '@iconify-json/ph' },
}

const THEMES: Record<string, { cssFile: string | null }> = {
  default: { cssFile: null },
  blueprint: { cssFile: 'blueprint.css' },
  brutalist: { cssFile: 'brutalist.css' },
  febin: { cssFile: 'febin.css' },
  forest: { cssFile: 'forest.css' },
  ghibli: { cssFile: 'ghibli.css' },
  ocean: { cssFile: 'ocean.css' },
  rose: { cssFile: 'rose.css' },
  sunset: { cssFile: 'sunset.css' },
  terminal: { cssFile: 'terminal.css' },
}

const VALIDATION_ADAPTERS: Record<string, { adapterFile: string; dep?: string }> = {
  zod: { adapterFile: 'zod.ts', dep: 'zod' },
  valibot: { adapterFile: 'valibot.ts', dep: 'valibot' },
  yup: { adapterFile: 'yup.ts', dep: 'yup' },
  arktype: { adapterFile: 'arktype.ts', dep: 'arktype' },
}

// ─── Helpers ────────────────────────────────────────────

function ask(question: string, options: string[]): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const optionList = options.map((o, i) => `  ${i + 1}) ${o}`).join('\n')
  const prompt = `\n${question}\n${optionList}\n\nChoice [1-${options.length}]: `

  return new Promise((resolve) => {
    const askOnce = () => {
      rl.question(prompt, (answer: string) => {
        const idx = parseInt(answer.trim(), 10) - 1
        if (idx >= 0 && idx < options.length) {
          rl.close()
          resolve(options[idx]!)
          return
        }
        // Re-prompt instead of silently picking the first option — silently
        // mutating the user's filesystem because they typed "y" by mistake
        // is the worst-case outcome here.
        console.log(`Invalid choice "${answer.trim()}"; please enter a number 1-${options.length}.`)
        askOnce()
      })
    }
    askOnce()
  })
}

function rmDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
    console.log(`  ✓ Removed ${path.relative(ROOT, dirPath)}`)
  }
}

function rmFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(`  ✓ Removed ${path.relative(ROOT, filePath)}`)
  }
}

function replaceInFile(filePath: string, search: string | RegExp, replacement: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  const updated = content.replace(search, replacement)
  if (content !== updated) {
    fs.writeFileSync(filePath, updated, 'utf-8')
    console.log(`  ✓ Updated ${path.relative(ROOT, filePath)}`)
  }
}

// ─── Pruning Functions ──────────────────────────────────

function pruneUiProviders(chosen: string) {
  console.log(`\n🧱 UI Provider: keeping "${chosen}"`)
  const providerDir = path.join(ROOT, 'src/modules/app/components/ui/provider')

  for (const [name, config] of Object.entries(UI_PROVIDERS)) {
    if (name === chosen) continue
    rmDir(path.join(providerDir, config.folder))
  }

  // Hard-code the chosen provider by updating the app store fallback
  const storeFile = path.join(ROOT, 'src/modules/app/stores/app.ts')
  replaceInFile(
    storeFile,
    /import\.meta\.env\.VUESTRATA_UI_PROVIDER\s*\|\|\s*'[^']+'/,
    `import.meta.env.VUESTRATA_UI_PROVIDER || '${chosen}'`,
  )
}

function pruneIconProviders(chosen: string) {
  console.log(`\n🎨 Icon Provider: keeping "${chosen}"`)
  const mapsDir = path.join(ROOT, 'src/modules/app/icons/maps')

  for (const [name, config] of Object.entries(ICON_PROVIDERS)) {
    if (name === chosen) continue
    rmFile(path.join(mapsDir, config.mapFile))
  }

  // Hard-code the chosen icon provider by updating the app store fallback
  const storeFile = path.join(ROOT, 'src/modules/app/stores/app.ts')
  replaceInFile(
    storeFile,
    /import\.meta\.env\.VUESTRATA_ICON_PROVIDER\s*\|\|\s*'[^']+'/,
    `import.meta.env.VUESTRATA_ICON_PROVIDER || '${chosen}'`,
  )
}

function pruneThemes(chosen: string) {
  console.log(`\n🎭 Theme: keeping "${chosen}"`)
  const themesDir = path.join(ROOT, 'src/modules/app/styles/themes')
  const appCss = path.join(ROOT, 'src/modules/app/styles/app.css')

  for (const [name, config] of Object.entries(THEMES)) {
    if (name === chosen || !config.cssFile) continue
    rmFile(path.join(themesDir, config.cssFile))
    // Remove the import line from app.css
    replaceInFile(
      appCss,
      new RegExp(`@import\\s+['"]\\./themes/${config.cssFile}['"];?\\s*\\n?`),
      '',
    )
  }

  // Remove unused entries from theme.config.ts
  const themeConfig = path.join(ROOT, 'src/modules/app/config/theme.config.ts')
  for (const name of Object.keys(THEMES)) {
    if (name === chosen || name === 'default') continue
    replaceInFile(themeConfig, new RegExp(`\\s*\\{[^}]*name:\\s*'${name}'[^}]*\\},?\\n?`), '')
  }
}

function pruneValidationAdapters(chosen: string) {
  console.log(`\n✅ Validation Adapter: keeping "${chosen}"`)
  const adaptersDir = path.join(ROOT, 'src/modules/core/lib/validation/adapters')

  for (const [name, config] of Object.entries(VALIDATION_ADAPTERS)) {
    if (name === chosen) continue
    rmFile(path.join(adaptersDir, config.adapterFile))
  }

  // Hard-code the chosen validation adapter by updating the app store fallback
  const storeFile = path.join(ROOT, 'src/modules/app/stores/app.ts')
  replaceInFile(
    storeFile,
    /import\.meta\.env\.VUESTRATA_VALIDATION_ADAPTER\s*\|\|\s*'[^']+'/,
    `import.meta.env.VUESTRATA_VALIDATION_ADAPTER || '${chosen}'`,
  )
}

function collectUnusedDeps(
  chosenUi: string,
  chosenIcon: string,
  chosenValidation: string,
): string[] {
  const deps: string[] = []

  for (const [name, config] of Object.entries(UI_PROVIDERS)) {
    if (name !== chosenUi && config.dep) deps.push(config.dep)
  }
  for (const [name, config] of Object.entries(ICON_PROVIDERS)) {
    if (name !== chosenIcon && config.dep) deps.push(config.dep)
  }
  for (const [name, config] of Object.entries(VALIDATION_ADAPTERS)) {
    if (name !== chosenValidation && config.dep) deps.push(config.dep)
  }

  return deps
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║   🚀 Vuestrata Scaffold CLI          ║')
  console.log('╚══════════════════════════════════════╝')
  console.log('\nThis will prune unused providers, themes, and adapters.')
  console.log('Files will be permanently deleted. Make sure you have a clean git state.\n')

  const chosenUi = await ask('Which UI component provider?', Object.keys(UI_PROVIDERS))
  const chosenIcon = await ask('Which icon provider?', Object.keys(ICON_PROVIDERS))
  const chosenTheme = await ask('Which theme?', Object.keys(THEMES))
  const chosenValidation = await ask('Which validation adapter?', Object.keys(VALIDATION_ADAPTERS))

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Pruning unused files...')

  pruneUiProviders(chosenUi)
  pruneIconProviders(chosenIcon)
  pruneThemes(chosenTheme)
  pruneValidationAdapters(chosenValidation)

  const unusedDeps = collectUnusedDeps(chosenUi, chosenIcon, chosenValidation)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Done! ✨\n')

  if (unusedDeps.length > 0) {
    console.log('You can now remove unused dependencies:')
    console.log(`  pnpm remove ${unusedDeps.join(' ')}\n`)
  }

  console.log('You can safely delete scripts/scaffold.ts after scaffolding.')
}

main().catch(console.error)
