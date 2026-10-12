import { inSlot } from '../../src/lib/manifest.mjs'
import { hashContents } from '../../src/lib/plan.mjs'
import { SHIPPED, shippedCopy } from './shipped.mjs'
import { inEolOf } from './text.mjs'

export const LOCALE_FILES = [
  'src/modules/app/plugins/i18n.ts',
  'src/modules/app/composables/useActiveLocale.ts',
  'src/modules/app/composables/useLocales.ts',
  'src/modules/i18n.ts',
  'src/modules/index.ts',
]
const CATALOG_STATE = 'src/modules/app/state/locale-catalogs.ts'

export function localeTarget(file, manifest) {
  return file.startsWith('src/modules/app/')
    ? inSlot(manifest, 'appDir', file.slice('src/modules/app/'.length))
    : inSlot(manifest, 'modulesDir', file.slice('src/modules/'.length))
}

function enabled(ws, release, manifest) {
  return (
    (ws.exists(localeTarget(CATALOG_STATE, manifest)) || release.has(CATALOG_STATE)) &&
    LOCALE_FILES.every((file) => ws.exists(localeTarget(file, manifest)))
  )
}

function isCurrent(file, source) {
  return hashContents(source) === hashContents(shippedCopy(file))
}

// The shell, selection model and boot must move together: replacing only the
// plugin would let an older boot mount before its persisted language arrives.
function ready(ws, manifest, release) {
  const state = localeTarget(CATALOG_STATE, manifest)
  if (
    ws.exists(state) &&
    (!release.has(CATALOG_STATE) ||
      hashContents(ws.read(state)) !== hashContents(release.read(CATALOG_STATE)))
  )
    return false
  return LOCALE_FILES.every((file) => {
    const source = ws.read(localeTarget(file, manifest))
    return isCurrent(file, source) || SHIPPED[file].includes(hashContents(source))
  })
}

export default {
  description: 'load language catalogs on demand and await the persisted language before mounting',
  steps: [
    ...LOCALE_FILES.map((file) => ({
      file: (manifest) => localeTarget(file, manifest),
      pending: (source, manifest, ws, release) =>
        enabled(ws, release, manifest) && !isCurrent(file, source),
      apply: (source, manifest, ws, release) =>
        ready(ws, manifest, release) ? inEolOf(source, shippedCopy(file)) : source,
      incoming: () => shippedCopy(file),
      note: false,
    })),
    {
      kind: 'note',
      note: (source, manifest, ws, release) => {
        if (!enabled(ws, release, manifest) || ready(ws, manifest, release)) return false
        if (LOCALE_FILES.every((file) => isCurrent(file, ws.read(localeTarget(file, manifest)))))
          return false
        return (
          'The language-loading files depend on one another and a file or their coordinator has project edits. ' +
          'The group was kept; merge the copies in .vuestrata/incoming/ together. Await loadModuleTranslations before mounting, ' +
          'and preload a selected language before persisting it. Existing eager module catalogs remain supported. ' +
          'See UPGRADING.md for the optional module-catalog optimization.'
        )
      },
    },
  ],
}
