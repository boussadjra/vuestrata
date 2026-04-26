/// <reference types="vite-plus/client" />

interface ImportMetaEnv {
  readonly VUESTRATA_APP_TITLE: string
  readonly VUESTRATA_APP_URL: string
  readonly VUESTRATA_API_URL: string
  readonly VUESTRATA_USE_MOCKS: string
  readonly VUESTRATA_AUTH_ADAPTER: 'jwt' | 'oauth' | 'mock'
  readonly VUESTRATA_UI_PROVIDER: 'reka' | 'vuetify0'
  readonly VUESTRATA_ICON_PROVIDER: 'solar' | 'lucide' | 'phosphor'
  readonly VUESTRATA_VALIDATION_ADAPTER: 'zod' | 'valibot' | 'yup' | 'arktype'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
