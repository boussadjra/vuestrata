import { useStorage, type RemovableRef } from '@vueuse/core'

import { createScopedLogger } from '~/lib/logger'

const storageLogger = createScopedLogger('storage')

type Factory<T> = T | (() => T)

export interface AppStorageSerializer<T> {
  read: (raw: string) => T
  write: (value: T) => string
}

interface UseAppStorageOptions<T> {
  serializer?: AppStorageSerializer<T>
  validate?: (value: T) => boolean
  fallback?: Factory<T>
  mergeDefaults?: boolean
  writeDefaults?: boolean
  deep?: boolean
  shallow?: boolean
  listenToStorageChanges?: boolean
  initOnMounted?: boolean
  onError?: (error: unknown) => void
}

function resolveValue<T>(value: Factory<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function createJsonSerializer<T>(fallback: Factory<T>): AppStorageSerializer<T> {
  return {
    read: (raw) => {
      if (!raw) return resolveValue(fallback)
      return JSON.parse(raw) as T
    },
    write: (value) => JSON.stringify(value),
  }
}

export const nullableStringSerializer: AppStorageSerializer<string | null> = {
  read: (raw) => raw || null,
  write: (value) => value ?? '',
}

export function useAppStorage<T>(
  key: string,
  defaults: Factory<T>,
  options: UseAppStorageOptions<T> = {},
): RemovableRef<T> | Ref<T> {
  const resolveFallback = () => resolveValue(options.fallback ?? defaults)
  const validate = options.validate ?? (() => true)

  if (typeof window === 'undefined') {
    return ref(resolveFallback()) as Ref<T>
  }

  const serializer = options.serializer
    ? {
        read: (raw: string) => {
          try {
            const parsed = options.serializer!.read(raw)
            return validate(parsed) ? parsed : resolveFallback()
          } catch (err) {
            options.onError?.(err)
            storageLogger.warn(`Failed to deserialize "${key}"; using fallback`, { err })
            return resolveFallback()
          }
        },
        write: (value: T) => options.serializer!.write(value),
      }
    : undefined

  const state = useStorage<T>(key, resolveFallback(), localStorage, {
    serializer,
    mergeDefaults: options.mergeDefaults,
    writeDefaults: options.writeDefaults ?? true,
    deep: options.deep,
    shallow: options.shallow,
    listenToStorageChanges: options.listenToStorageChanges,
    initOnMounted: options.initOnMounted,
    onError: options.onError as ((error: unknown) => void) | undefined,
  })

  watch(
    state,
    (value) => {
      if (!validate(value)) {
        state.value = resolveFallback()
      }
    },
    { immediate: true },
  )

  return state
}
