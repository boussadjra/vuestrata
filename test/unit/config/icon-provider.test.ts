import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vite-plus/test'

import { resolveIcon, registerIconMap, getIconProviders } from '@/config/icon-provider'
import type { IconMap, IconName } from '~/types'

describe('Icon Provider', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should resolve icon from default solar map', () => {
    const cls = resolveIcon('bolt')
    expect(cls).toBe('i-solar-bolt-linear')
  })

  it('should fall back to widget for unknown icon names', () => {
    const cls = resolveIcon('nonexistent' as IconName)
    expect(cls).toBe('i-solar-widget-2-linear')
  })

  it('should list built-in providers', () => {
    const providers = getIconProviders()
    expect(providers).toContain('solar')
    expect(providers).toContain('lucide')
    expect(providers).toContain('phosphor')
    expect(providers).toContain('iconoir')
    expect(providers).toContain('tabler')
    expect(providers).toContain('mingcute')
    expect(providers).toContain('remix')
    expect(providers).toContain('griddy')
    expect(providers).toContain('iconamoon')
  })

  it('should register and use a custom icon map', () => {
    const customMap = { bolt: 'custom-bolt' } as IconMap
    registerIconMap('test-custom', customMap)
    expect(getIconProviders()).toContain('test-custom')
  })
})
