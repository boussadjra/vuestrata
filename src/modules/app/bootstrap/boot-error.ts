import { reportError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import { removeAppLoader } from './app-loader'

/**
 * What the visitor gets when a step of `boot()` throws.
 *
 * `boot()` runs before there is an app to render into, so this cannot use Vue,
 * i18n or a `Ui*` component: it writes plain DOM into `#app`. Until it existed
 * a failed boot was logged and nothing else, which left the `#app-loader`
 * spinner from `index.html` turning forever.
 *
 * The screen has a heading, one sentence, a Reload button and a collapsed block
 * of technical detail. The detail is the error's name and its first message
 * line, with URLs and query strings removed: never a stack, never a response
 * body, because a person will paste this into a support ticket.
 *
 * It replaces what used to be a log-only function without changing the
 * signature, which is why `boot()` reaches it through its dependencies.
 *
 * Must never throw: it is the last line of defence for a failed boot, and an
 * exception here would surface as an unhandled rejection with nothing shown.
 */
export function renderBootFailure(err: unknown): void {
  // Each step is guarded on its own: a logger that throws must not stop the
  // loader coming down, and a DOM that refuses the screen must not stop the
  // report going out.
  try {
    logger.error('Bootstrap failed:', { err })
  } catch {
    // Nothing left to log with.
  }
  try {
    reportError(err, { source: 'bootstrap' })
  } catch {
    // `reportError` already swallows reporter failures; this only guards a
    // reporter that throws while being resolved.
  }

  try {
    showFailureScreen(err)
  } catch {
    // Fall through: the loader still has to go.
  }
  try {
    removeAppLoader({ immediate: true })
  } catch {
    // Nothing else can be done about it.
  }
}

/**
 * The strings live here, and not in the locale catalogs, on purpose. This screen
 * appears exactly when the app could not start, which includes "the locale
 * catalogs never loaded" and "vue-i18n threw during install". It may depend on
 * nothing that boot() builds.
 *
 * Kept to the locales the template ships. A language a project adds falls back
 * to English here, which is a worse screen but still a working one.
 */
const STRINGS = {
  en: {
    title: 'Something went wrong',
    body: 'The application could not start; reloading the page usually fixes it.',
    reload: 'Reload page',
    details: 'Technical details',
  },
  fr: {
    title: "Une erreur s'est produite",
    body: "L'application n'a pas pu démarrer ; recharger la page suffit généralement à corriger le problème.",
    reload: 'Recharger la page',
    details: 'Détails techniques',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'تعذّر تشغيل التطبيق، وعادةً ما تحل إعادة تحميل الصفحة المشكلة.',
    reload: 'إعادة تحميل الصفحة',
    details: 'التفاصيل التقنية',
  },
} as const

/**
 * Where `plugins/appearance.ts` keeps the visitor's locale and dark-mode choice.
 * Repeated here, not imported, for the same reason the strings are: this screen
 * has to work when the app's own modules are what failed. `boot-error.test.ts`
 * checks the two stay equal.
 */
const STORAGE_KEYS = { locale: 'vuestrata-locale', dark: 'vuestrata-dark' } as const

type FailureLanguage = keyof typeof STRINGS

const RTL_LANGUAGES: ReadonlySet<FailureLanguage> = new Set(['ar'])

function isFailureLanguage(value: string | null | undefined): value is FailureLanguage {
  return typeof value === 'string' && Object.hasOwn(STRINGS, value)
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * The persisted locale wins, because it is the language the visitor chose. A
 * first visit has none, so the browser's own preference decides.
 */
function pickLanguage(): FailureLanguage {
  const persisted = readStorage(STORAGE_KEYS.locale)
  if (isFailureLanguage(persisted)) return persisted

  try {
    const preferred = [...(navigator.languages ?? []), navigator.language]
    for (const tag of preferred) {
      const primary = tag?.toLowerCase().split('-', 1)[0]
      if (isFailureLanguage(primary)) return primary
    }
  } catch {
    // No navigator: English.
  }
  return 'en'
}

/**
 * Dark when the app itself would be. `bootstrapTheme()` has normally set the
 * `dark` class already; the stored preference and then the OS setting cover a
 * failure that happened before it ran.
 */
function prefersDark(): boolean {
  if (document.documentElement.classList.contains('dark')) return true
  const saved = readStorage(STORAGE_KEYS.dark)
  if (saved === 'true') return true
  if (saved === 'false') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

const MAX_DETAIL_LENGTH = 200

/**
 * A short, safe description of the failure: `Name: first line of the message`.
 *
 * URLs and query strings are cut out because a failed request's message can
 * carry a token or an id, and a stack is never included at all. Anything that
 * is not an `Error` is described by its type alone unless it is a string.
 */
function describeFailure(err: unknown): string {
  try {
    const name = err instanceof Error && err.name ? err.name : 'Error'
    const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
    const message = (raw.split('\n', 1)[0] ?? '')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]')
      .replace(/\?\S*/g, '')
      .trim()
    const text = message ? `${name}: ${message}` : name
    return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}…` : text
  } catch {
    // A getter that throws on `message` is still a failure worth a screen.
    return 'Error'
  }
}

/**
 * Colours are literal because the theme tokens are CSS the app loads, and this
 * screen may appear before it has. They follow `index.html`'s loader (white and
 * slate 900, indigo accent) and are chosen for contrast: body text is at least
 * 7:1 and the button label at least 6:1 in both schemes.
 */
const STYLES = `
#boot-failure{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5}
#boot-failure[data-scheme="dark"]{background:#0f172a;color:#f1f5f9}
#boot-failure .bf-card{width:100%;max-width:28rem}
#boot-failure h1{margin:0 0 .5rem;font-size:1.5rem;line-height:1.3;font-weight:700}
#boot-failure h1:focus{outline:none}
#boot-failure p{margin:0 0 1.5rem;color:#475569}
#boot-failure[data-scheme="dark"] p{color:#cbd5e1}
#boot-failure button{cursor:pointer;border:0;border-radius:.5rem;padding:.625rem 1.25rem;background:#4338ca;color:#fff;font:inherit;font-weight:600}
#boot-failure button:hover{background:#3730a3}
#boot-failure button:focus-visible{outline:2px solid #4338ca;outline-offset:2px}
#boot-failure[data-scheme="dark"] button{background:#818cf8;color:#0f172a}
#boot-failure[data-scheme="dark"] button:hover{background:#a5b4fc}
#boot-failure[data-scheme="dark"] button:focus-visible{outline-color:#a5b4fc}
#boot-failure details{margin-top:1.5rem;font-size:.875rem}
#boot-failure summary{cursor:pointer;color:#475569}
#boot-failure[data-scheme="dark"] summary{color:#cbd5e1}
#boot-failure pre{margin:.5rem 0 0;padding:.75rem;border-radius:.5rem;background:#f1f5f9;color:#0f172a;font:.8125rem ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;text-align:left}
#boot-failure[data-scheme="dark"] pre{background:#1e293b;color:#e2e8f0}
`

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

/** `#app`, or a fresh container when the page never had one. */
function findHost(): HTMLElement {
  const existing = document.getElementById('app')
  if (existing) return existing
  const created = el('div')
  created.id = 'app'
  document.body.appendChild(created)
  return created
}

function showFailureScreen(err: unknown): void {
  const language = pickLanguage()
  const strings = STRINGS[language]

  // A `main`, so the page still has its landmark and the alert sits inside one.
  const root = el('main')
  root.id = 'boot-failure'
  root.lang = language
  root.dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
  root.dataset.scheme = prefersDark() ? 'dark' : 'light'

  const card = el('div')
  card.className = 'bf-card'
  card.setAttribute('role', 'alert')

  const heading = el('h1', strings.title)
  // Focusable so the alert is read from its heading and a keyboard user starts
  // at the top of the screen instead of on a page that no longer exists.
  heading.tabIndex = -1

  const reload = el('button', strings.reload)
  reload.type = 'button'
  reload.addEventListener('click', () => window.location.reload())

  const details = el('details')
  const pre = el('pre', describeFailure(err))
  // Error messages are not localised, so they read left to right in every locale.
  pre.dir = 'ltr'
  details.append(el('summary', strings.details), pre)

  card.append(heading, el('p', strings.body), reload, details)
  root.append(el('style', STYLES), card)

  // Replaces whatever a half-finished boot left in the container.
  findHost().replaceChildren(root)
  heading.focus()
}
