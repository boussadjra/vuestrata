import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

/**
 * Create a fresh QueryClient for testing — no retries, instant GC.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Run a function inside a Vue component setup context with VueQueryPlugin installed.
 * This provides the injection context required by useQuery / useQueryClient.
 */
export function withQueryClient<T>(fn: (queryClient: QueryClient) => T): T {
  const queryClient = createTestQueryClient()
  let result: T

  const Wrapper = defineComponent({
    setup() {
      result = fn(queryClient)
      return () => h('div')
    },
  })

  mount(Wrapper, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })

  return result!
}
