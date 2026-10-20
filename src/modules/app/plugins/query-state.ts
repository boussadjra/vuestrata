import { queryAdapterKey } from '@queryweave/vue'
import { createVueRouterAdapter } from '@queryweave/vue-router'
import type { App } from 'vue'
import type { Router } from 'vue-router'

import { router as applicationRouter } from './router'

/** Installed through boot's existing extension hook, once per application. */
export function installQueryState(app: App, router: Router = applicationRouter): void {
  const adapter = createVueRouterAdapter(router)
  app.provide(queryAdapterKey, adapter)
  app.onUnmount(() => adapter.dispose())
}
