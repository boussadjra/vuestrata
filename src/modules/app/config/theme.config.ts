import { useCustomThemes } from '@/state/themes'
import type { ThemeConfig } from '~/types'

const builtinThemes: ThemeConfig[] = [
  { name: 'default', label: 'Default', cssClass: '' },
  { name: 'brutalist', label: 'Brutalist', cssClass: 'theme-brutalist' },
  { name: 'ghibli', label: 'Ghibli', cssClass: 'theme-ghibli' },
  { name: 'ocean', label: 'Ocean', cssClass: 'theme-ocean' },
  { name: 'sunset', label: 'Sunset', cssClass: 'theme-sunset' },
  { name: 'forest', label: 'Forest', cssClass: 'theme-forest' },
  { name: 'rose', label: 'Rose', cssClass: 'theme-rose' },
  { name: 'terminal', label: 'Terminal', cssClass: 'theme-terminal' },
  { name: 'blueprint', label: 'Blueprint', cssClass: 'theme-blueprint' },
  { name: 'harbour', label: 'Harbour', cssClass: 'theme-harbour' },
  // gen:themes-start
  { name: 'pro', label: 'Pro', cssClass: 'theme-pro' },
  // gen:themes-end
]

/** Register a custom theme at runtime */
export function registerTheme(config: ThemeConfig): void {
  const { customThemes } = useCustomThemes()
  if (!customThemes.value.some((t) => t.name === config.name)) {
    customThemes.value = [...customThemes.value, config]
  }
}

/** Get all registered themes (built-in + custom) */
export function getThemes(): ThemeConfig[] {
  const { customThemes } = useCustomThemes()
  return [...builtinThemes, ...customThemes.value]
}

/** Get a theme by name */
export function getTheme(name: string): ThemeConfig | undefined {
  return getThemes().find((t) => t.name === name)
}
