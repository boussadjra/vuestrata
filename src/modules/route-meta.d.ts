import 'vue-router'
import type { ModuleRouteMeta } from './types'

declare module 'vue-router' {
  interface RouteMeta extends ModuleRouteMeta {}
}
