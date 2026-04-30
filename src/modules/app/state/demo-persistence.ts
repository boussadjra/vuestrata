import { createScopedLogger } from '~/lib/logger'

export type DemoStoreName = 'users' | 'session'

const DEMO_DB_NAME = 'vuestrata-demo-auth'
const DEMO_DB_VERSION = 1
const DEMO_CHANNEL_STATE_KEY = '__vuestrataDemoPersistence'

const persistenceLogger = createScopedLogger('demo-persistence')

type PersistedRecord =
  | {
      id: IDBValidKey
      value: unknown
    }
  | {
      key: IDBValidKey
      value: unknown
    }

type DemoPersistenceState = {
  dbPromise: Promise<IDBDatabase> | null
  warnedUnavailable: boolean
  memoryStores: Record<DemoStoreName, Map<IDBValidKey, unknown>>
}

function ensureState(): DemoPersistenceState {
  const root = globalThis as typeof globalThis & {
    [DEMO_CHANNEL_STATE_KEY]?: DemoPersistenceState
  }

  if (!root[DEMO_CHANNEL_STATE_KEY]) {
    root[DEMO_CHANNEL_STATE_KEY] = {
      dbPromise: null,
      warnedUnavailable: false,
      memoryStores: {
        users: new Map<IDBValidKey, unknown>(),
        session: new Map<IDBValidKey, unknown>(),
      },
    }
  }

  return root[DEMO_CHANNEL_STATE_KEY]
}

function hasIndexedDB(): boolean {
  return typeof globalThis.indexedDB !== 'undefined'
}

function warnIndexedDbUnavailableOnce(): void {
  const state = ensureState()
  if (state.warnedUnavailable) return
  state.warnedUnavailable = true
  persistenceLogger.warn('IndexedDB unavailable. Falling back to in-memory demo persistence.')
}

function createFallbackDb(): IDBDatabase {
  // Callers should never rely on this object internals. It only satisfies the
  // `openDemoDB()` contract while operations route to the in-memory fallback.
  return {} as IDBDatabase
}

function wrapRecord(store: DemoStoreName, key: IDBValidKey, value: unknown): PersistedRecord {
  if (store === 'users') return { id: key, value }
  return { key, value }
}

function unwrapRecord(record: unknown): unknown {
  if (record && typeof record === 'object' && 'value' in record) {
    return (record as { value: unknown }).value
  }
  return record
}

function withStore<T>(
  db: IDBDatabase,
  storeName: DemoStoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)

    request.onsuccess = () => {
      resolve(request.result as T)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    }
  })
}

export function openDemoDB(): Promise<IDBDatabase> {
  const state = ensureState()

  if (!hasIndexedDB()) {
    warnIndexedDbUnavailableOnce()
    return Promise.resolve(createFallbackDb())
  }

  if (state.dbPromise) return state.dbPromise

  state.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DEMO_DB_NAME, DEMO_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open demo IndexedDB'))
    }
  }).catch((error: unknown) => {
    // When open fails (quota/private mode), drop to in-memory fallback.
    warnIndexedDbUnavailableOnce()
    persistenceLogger.warn('Failed to open demo IndexedDB. Falling back to in-memory state.', {
      error,
    })
    return createFallbackDb()
  })

  return state.dbPromise
}

export async function getRecord<T>(store: DemoStoreName, key: IDBValidKey): Promise<T | null> {
  const state = ensureState()

  if (!hasIndexedDB()) {
    return (state.memoryStores[store].get(key) as T | undefined) ?? null
  }

  try {
    const db = await openDemoDB()
    const result = await withStore<unknown>(db, store, 'readonly', (objectStore) =>
      objectStore.get(key),
    )
    if (result === undefined) return null
    return unwrapRecord(result) as T
  } catch {
    return (state.memoryStores[store].get(key) as T | undefined) ?? null
  }
}

export async function putRecord<T>(
  store: DemoStoreName,
  key: IDBValidKey,
  value: T,
): Promise<void> {
  const state = ensureState()

  if (!hasIndexedDB()) {
    state.memoryStores[store].set(key, value)
    return
  }

  try {
    const db = await openDemoDB()
    await withStore<IDBValidKey>(db, store, 'readwrite', (objectStore) =>
      objectStore.put(wrapRecord(store, key, value)),
    )
  } catch {
    state.memoryStores[store].set(key, value)
  }
}

export async function deleteRecord(store: DemoStoreName, key: IDBValidKey): Promise<void> {
  const state = ensureState()

  if (!hasIndexedDB()) {
    state.memoryStores[store].delete(key)
    return
  }

  try {
    const db = await openDemoDB()
    await withStore<unknown>(db, store, 'readwrite', (objectStore) => objectStore.delete(key))
  } catch {
    state.memoryStores[store].delete(key)
  }
}

export async function clearStore(store: DemoStoreName): Promise<void> {
  const state = ensureState()

  if (!hasIndexedDB()) {
    state.memoryStores[store].clear()
    return
  }

  try {
    const db = await openDemoDB()
    await withStore<unknown>(db, store, 'readwrite', (objectStore) => objectStore.clear())
  } catch {
    state.memoryStores[store].clear()
  }
}
