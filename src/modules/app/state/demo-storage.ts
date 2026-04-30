import { deleteRecord, getRecord, putRecord, type DemoStoreName } from './demo-persistence'

export type DemoInvalidationEvent = 'clear' | 'update'

export type DemoEnvelope<T> = {
  version: 1
  createdAt: number
  expiresAt: number
  integrityHash: string
  payload: T
}

type DemoInvalidationCallback = (event: DemoInvalidationEvent) => void

type DemoStorageState = {
  channel: BroadcastChannel | null
}

const DEMO_ENVELOPE_VERSION = 1
const DEMO_CHANNEL_NAME = 'vuestrata-demo-auth'
const DEMO_STORAGE_EVENT_KEY = 'vuestrata-demo-auth-invalidation'
const DEMO_STORAGE_STATE_KEY = '__vuestrataDemoStorage'
const DEMO_SALT = import.meta.env.VITE_VUESTRATA_DEMO_SALT ?? 'vuestrata-demo-v1'

type SerializedInvalidation = {
  event: DemoInvalidationEvent
  emittedAt: number
  nonce: string
}

function ensureState(): DemoStorageState {
  const root = globalThis as typeof globalThis & {
    [DEMO_STORAGE_STATE_KEY]?: DemoStorageState
  }

  if (!root[DEMO_STORAGE_STATE_KEY]) {
    root[DEMO_STORAGE_STATE_KEY] = { channel: null }
  }

  return root[DEMO_STORAGE_STATE_KEY]
}

function getChannel(): BroadcastChannel | null {
  if (typeof globalThis.BroadcastChannel === 'undefined') return null

  const state = ensureState()
  state.channel ??= new BroadcastChannel(DEMO_CHANNEL_NAME)
  return state.channel
}

function createNonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function isInvalidationEvent(event: unknown): event is DemoInvalidationEvent {
  return event === 'clear' || event === 'update'
}

function parseStorageInvalidation(value: string): DemoInvalidationEvent | null {
  try {
    const parsed = JSON.parse(value) as Partial<SerializedInvalidation>
    return isInvalidationEvent(parsed.event) ? parsed.event : null
  } catch {
    return null
  }
}

function writeStorageInvalidation(event: DemoInvalidationEvent): void {
  if (typeof globalThis.localStorage === 'undefined') return

  const payload: SerializedInvalidation = {
    event,
    emittedAt: Date.now(),
    nonce: createNonce(),
  }

  try {
    globalThis.localStorage.setItem(DEMO_STORAGE_EVENT_KEY, JSON.stringify(payload))
  } catch {
    // Private browsing and embedded webviews can deny localStorage; the
    // BroadcastChannel path above still covers browsers that support it.
  }
}

function encodeText(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function digest(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return value
  }

  const hash = await globalThis.crypto.subtle.digest('SHA-256', encodeText(value))
  return toHex(hash)
}

async function createIntegrityHash(serializedPayload: string): Promise<string> {
  return digest(`${serializedPayload}:${DEMO_SALT}`)
}

function isDemoEnvelope<T>(record: unknown): record is DemoEnvelope<T> {
  if (!record || typeof record !== 'object') return false

  const envelope = record as Partial<DemoEnvelope<T>>
  return (
    envelope.version === DEMO_ENVELOPE_VERSION &&
    typeof envelope.createdAt === 'number' &&
    typeof envelope.expiresAt === 'number' &&
    typeof envelope.integrityHash === 'string' &&
    'payload' in envelope
  )
}

export async function writeEnvelope<T>(
  store: DemoStoreName,
  key: IDBValidKey,
  payload: T,
  ttlHours: number,
): Promise<void> {
  const now = Date.now()
  const serializedPayload = JSON.stringify(payload)
  const envelope: DemoEnvelope<T> = {
    version: DEMO_ENVELOPE_VERSION,
    createdAt: now,
    expiresAt: now + Math.max(1, ttlHours) * 60 * 60 * 1000,
    integrityHash: await createIntegrityHash(serializedPayload),
    payload,
  }

  await putRecord(store, key, envelope)
  broadcastInvalidation('update')
}

export async function readEnvelope<T>(store: DemoStoreName, key: IDBValidKey): Promise<T | null> {
  const envelope = await getRecord<unknown>(store, key)

  if (!isDemoEnvelope<T>(envelope)) {
    await deleteRecord(store, key)
    return null
  }

  if (envelope.expiresAt <= Date.now()) {
    await deleteRecord(store, key)
    return null
  }

  const serializedPayload = JSON.stringify(envelope.payload)
  const expectedHash = await createIntegrityHash(serializedPayload)

  if (envelope.integrityHash !== expectedHash) {
    await deleteRecord(store, key)
    return null
  }

  return envelope.payload
}

export function broadcastInvalidation(event: DemoInvalidationEvent): void {
  getChannel()?.postMessage(event)
  writeStorageInvalidation(event)
}

export function onInvalidation(callback: DemoInvalidationCallback): () => void {
  const channel = getChannel()
  const cleanup: Array<() => void> = []

  const listener = (event: MessageEvent<DemoInvalidationEvent>) => {
    if (isInvalidationEvent(event.data)) callback(event.data)
  }

  if (channel) {
    channel.addEventListener('message', listener)
    cleanup.push(() => channel.removeEventListener('message', listener))
  }

  if (typeof globalThis.addEventListener === 'function') {
    const storageListener = (event: StorageEvent) => {
      if (event.key !== DEMO_STORAGE_EVENT_KEY || !event.newValue) return

      const invalidation = parseStorageInvalidation(event.newValue)
      if (invalidation) callback(invalidation)
    }

    globalThis.addEventListener('storage', storageListener)
    cleanup.push(() => globalThis.removeEventListener('storage', storageListener))
  }

  return () => {
    for (const teardown of cleanup) teardown()
  }
}
