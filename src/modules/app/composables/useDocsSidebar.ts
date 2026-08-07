/**
 * Docs mobile nav drawer open state.
 *
 * `AppHeader` renders the toggle button (mirroring the dashboard's
 * header-embedded sidebar toggle) while `DocsShell`/`DocsSidebar` render the
 * panel it controls. Neither is an ancestor of the other — both are children
 * of the `docs` layout — so the boolean has to live above both, provided
 * once by the layout and injected by whichever side needs it.
 */
import type { InjectionKey, Ref } from 'vue'

export interface DocsSidebarControls {
  open: Ref<boolean>
  toggle: () => void
  close: () => void
}

export const DOCS_SIDEBAR_KEY: InjectionKey<DocsSidebarControls> = Symbol('vuestrata:docs-sidebar')

/** Called once by the docs layout. */
export function provideDocsSidebar(): DocsSidebarControls {
  const open = ref(false)
  const controls: DocsSidebarControls = {
    open,
    toggle: () => {
      open.value = !open.value
    },
    close: () => {
      open.value = false
    },
  }
  provide(DOCS_SIDEBAR_KEY, controls)
  return controls
}

/**
 * Outside the docs layout (AppHeader is shared across every layout) there is
 * no panel to control — a local, inert ref keeps callers from having to
 * branch on which layout they're rendered in.
 */
export function useDocsSidebar(): DocsSidebarControls {
  return (
    inject(DOCS_SIDEBAR_KEY, null) ?? {
      open: ref(false),
      toggle: () => {},
      close: () => {},
    }
  )
}
