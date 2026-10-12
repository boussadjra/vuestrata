/**
 * A `deploy.config.ts` as a project would write one: its own variables, one of
 * them runtime-overridable, and a wider header policy. The seeded file in the
 * template declares nothing, so the loader tests read this one instead.
 */
import { z } from 'zod'

import { defineDeployConfig } from '~/lib/config/deploy'

export default defineDeployConfig({
  env: {
    VUESTRATA_SUPABASE_URL: z.url().optional(),
    VUESTRATA_FEATURE_BILLING: z.enum(['on', 'off']).default('off'),
  },
  runtime: ['VUESTRATA_SUPABASE_URL'],
  headers: {
    connectSrc: ['https://login.acme.test', 'wss://realtime.acme.test'],
    connectSrcFromEnv: ['VUESTRATA_SUPABASE_URL'],
    websocketFromEnv: ['VUESTRATA_SUPABASE_URL'],
    imgSrc: ['https://images.acme.test'],
    crossOriginOpenerPolicy: 'same-origin-allow-popups',
  },
})
