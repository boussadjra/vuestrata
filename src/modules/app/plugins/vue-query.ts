import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'

export const vueQueryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  },
}

export { VueQueryPlugin }
