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
    expect(cls).toBe('i-solar-bolt-bold')
  })

  it('should return empty string for unknown icon', () => {
    const cls = resolveIcon('nonexistent' as IconName)
    expect(cls).toBe('')
  })

  it('should list built-in providers', () => {
    const providers = getIconProviders()
    expect(providers).toContain('solar')
    expect(providers).toContain('lucide')
    expect(providers).toContain('phosphor')
  })

  it('should register and use a custom icon map', () => {
    const customMap = { bolt: 'custom-bolt' } as IconMap
    registerIconMap('test-custom', customMap)
    expect(getIconProviders()).toContain('test-custom')
  })
})
