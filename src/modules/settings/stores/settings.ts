import { defineStore } from 'pinia'

import { useAppStorage } from '~/composables/useAppStorage'
import { appEvents } from '~/lib/events'

import type { SettingsState } from '../types'

/**
 * Settings store — client-state only.
 *
 * This store demonstrates the Pinia pattern:
 *   - Persisted to localStorage (display preferences survive reload)
 *   - No API calls — Pinia stores must NOT fetch server state
 *   - All server-sourced configuration belongs in TanStack Query
 *   - Emits events so other modules can react to setting changes
 */
export const useSettingsStore = defineStore('settings', () => {
  // ─── State ──────────────────────────────────────────

  const featureFlags = useAppStorage<Record<string, boolean>>('vuestrata:settings:flags', {
    'advanced-analytics': false,
    'bulk-operations': true,
    'keyboard-shortcuts': true,
    'two-factor-prompt': true,
  })

  const displayDensity = useAppStorage<SettingsState['displayDensity']>(
    'vuestrata:settings:density',
    'comfortable',
  )
  const defaultPageSize = useAppStorage<SettingsState['defaultPageSize']>(
    'vuestrata:settings:page-size',
    20,
  )

  // ─── Getters ────────────────────────────────────────

  function isFeatureEnabled(flag: string): boolean {
    return featureFlags.value[flag] ?? false
  }

  // ─── Actions ────────────────────────────────────────

  function setFeatureFlag(flag: string, enabled: boolean): void {
    featureFlags.value[flag] = enabled
    appEvents.emit('settings.changed', { key: `feature.${flag}`, value: enabled })
  }

  function setDisplayDensity(density: SettingsState['displayDensity']): void {
    displayDensity.value = density
    appEvents.emit('settings.changed', { key: 'displayDensity', value: density })
  }

  function setDefaultPageSize(size: SettingsState['defaultPageSize']): void {
    defaultPageSize.value = size
    appEvents.emit('settings.changed', { key: 'defaultPageSize', value: size })
  }

  function resetToDefaults(): void {
    featureFlags.value = {
      'advanced-analytics': false,
      'bulk-operations': true,
      'keyboard-shortcuts': true,
      'two-factor-prompt': true,
    }
    displayDensity.value = 'comfortable'
    defaultPageSize.value = 20
  }

  return {
    featureFlags,
    displayDensity,
    defaultPageSize,
    isFeatureEnabled,
    setFeatureFlag,
    setDisplayDensity,
    setDefaultPageSize,
    resetToDefaults,
  }
})
