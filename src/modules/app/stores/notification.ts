import { defineStore } from 'pinia'

import type { Notification } from '~/types'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([])
  // Track auto-dismiss timers so they can be cancelled when the notification
  // is removed manually or the store is cleared. Otherwise timers keep a
  // closure over `id`/`remove` alive until they fire, leaking memory and
  // potentially mutating state after the store has been disposed.
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function add(notification: Omit<Notification, 'id'>) {
    const id = crypto.randomUUID()
    const item: Notification = { ...notification, id }
    notifications.value.push(item)

    const duration = notification.duration ?? 5000
    if (duration > 0) {
      const handle = setTimeout(() => {
        timers.delete(id)
        remove(id)
      }, duration)
      timers.set(id, handle)
    }
  }

  function remove(id: string) {
    const handle = timers.get(id)
    if (handle !== undefined) {
      clearTimeout(handle)
      timers.delete(id)
    }
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }

  function clear() {
    for (const handle of timers.values()) clearTimeout(handle)
    timers.clear()
    notifications.value = []
  }

  return { notifications, add, remove, clear }
})
