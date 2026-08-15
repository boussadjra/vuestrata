/**
 * Route-boundary normalization.
 *
 * The point of this composable is that a feature never sees the router's
 * `string | null | (string | null)[]`, so these cases are the contract.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vite-plus/test'
import { defineComponent, h, type ComputedRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useRouteQueryParam } from '@/composables/useRouteQueryParam'

async function readParam(url: string, name = 'thread'): Promise<string | undefined> {
  const Probe = defineComponent({
    setup() {
      const value = useRouteQueryParam(name)
      return { value } as { value: ComputedRef<string | undefined> }
    },
    render: () => h('div'),
  })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/messages', component: Probe }],
  })

  await router.push(url)
  await router.isReady()

  const wrapper = mount(Probe, { global: { plugins: [router] } })
  return (wrapper.vm as unknown as { value: string | undefined }).value
}

describe('useRouteQueryParam', () => {
  it('reads a plain value', async () => {
    expect(await readParam('/messages?thread=m-7')).toBe('m-7')
  })

  it('is undefined when the key is absent', async () => {
    expect(await readParam('/messages')).toBeUndefined()
  })

  // `?thread` with no value arrives as null. Treating it as the empty string
  // would make a lookup for `""` and render an empty pane.
  it('is undefined for a valueless key', async () => {
    expect(await readParam('/messages?thread')).toBeUndefined()
  })

  // A repeated key arrives as an array. `String(value)` would produce "a,b"
  // and match no record.
  it('takes the first entry of a repeated key', async () => {
    expect(await readParam('/messages?thread=a&thread=b')).toBe('a')
  })
})
