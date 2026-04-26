/**
 * Typed event bus for decoupled cross-module communication.
 *
 * Usage pattern:
 *   - Module A emits an event via `appEvents.emit('user.created', payload)`
 *   - Module B listens via `appEvents.on('user.created', handler)`
 *   - Neither module imports from the other's internals
 *
 * Rules:
 *   - Only use for one-way, fire-and-forget notifications between modules
 *   - Do NOT use for request/response patterns — use composables & query invalidation for that
 *   - Keep event payloads minimal and serializable (avoid Vue reactivity wrappers)
 */

import { createScopedLogger } from './logger'

const eventsLogger = createScopedLogger('events')

type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

export interface AppEventMap {
  // ─── Auth Events ────────────────────────────────────────
  'auth.login': { userId: string; role: string }
  'auth.logout': Record<never, never>

  // ─── User Module Events ─────────────────────────────────
  'user.created': { userId: string; email: string; role: string }
  'user.updated': { userId: string; changes: Record<string, unknown> }
  'user.deleted': { userId: string }
  'user.role_changed': { userId: string; oldRole: string; newRole: string }

  // ─── Billing Module Events ──────────────────────────────
  'billing.plan_changed': { oldPlanId: string; newPlanId: string }
  'billing.subscription_canceled': Record<never, never>

  // ─── Settings Module Events ─────────────────────────────
  'settings.changed': { key: string; value: unknown }
}

export type AppEventName = keyof AppEventMap

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class EventBus<EventMap extends Record<keyof EventMap, any>> {
  private readonly listeners = new Map<string, Set<EventHandler>>()

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    const key = event as string
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(handler as EventHandler)

    // Return an unsubscribe function
    return () => this.off(event, handler)
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.listeners.get(event as string)?.delete(handler as EventHandler)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event as string)
    if (!handlers?.size) return
    for (const handler of handlers) {
      try {
        const result = handler(payload)
        // Surface async failures too — a rejected promise from a handler
        // would otherwise become an unhandled rejection that's hard to trace
        // back to the originating event.
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          ;(result as Promise<unknown>).catch((err) => {
            eventsLogger.error(`Async event handler for "${String(event)}" rejected`, { err })
          })
        }
      } catch (err) {
        // Event handlers must not crash the emitter, but they must be
        // observable — swallowing silently was hiding real bugs.
        eventsLogger.error(`Event handler for "${String(event)}" threw`, { err })
      }
    }
  }

  /** Remove all listeners for a given event (useful in tests). */
  clear(event?: AppEventName): void {
    if (event) {
      this.listeners.delete(event as string)
    } else {
      this.listeners.clear()
    }
  }
}

/** Singleton app-wide event bus. */
export const appEvents = new EventBus<AppEventMap>()
