/**
 * Name derivation for the generators.
 *
 * One argument on the command line (`payments`) has to become a dozen spellings
 * across a dozen files: a module id, a PascalCase entity, a camelCase variable,
 * a SCREAMING_SNAKE constant, a human label. Deriving them in one place is what
 * lets the templates stay literal, and what stops a generated module from being
 * `Payments` in one file and `payment` in the next.
 */

/** Naive singularisation. Override with `--entity` when it guesses wrong. */
export function singularize(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(ss|sh|ch|x|z)es$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, '')
  return word
}

export function pluralize(word) {
  if (/y$/i.test(word) && !/[aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies')
  if (/(s|sh|ch|x|z)$/i.test(word)) return `${word}es`
  if (/s$/i.test(word)) return word
  return `${word}s`
}

const words = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

export const kebab = (value) =>
  words(value)
    .map((w) => w.toLowerCase())
    .join('-')

export const camel = (value) =>
  words(value)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')

export const pascal = (value) => {
  const c = camel(value)
  return c ? c[0].toUpperCase() + c.slice(1) : c
}

export const screaming = (value) =>
  words(value)
    .map((w) => w.toUpperCase())
    .join('_')

/** Title Case for human-facing labels: `payment-methods` → `Payment Methods`. */
export const title = (value) =>
  words(value)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

/**
 * The full token set for a module named `payments` (entity `payment`):
 *
 *   moduleId      payments          directory + config.id + resource
 *   Entity        Payment           type + schema names
 *   entity        payment           locals, params
 *   Entities      Payments          plural type-ish names
 *   entities      payments          collection locals, query keys
 *   ENTITY        PAYMENT           enum-ish constant prefixes
 *   ENTITIES      PAYMENTS          `PAYMENT_STATUSES` style constants
 *   Label         Payments          human copy in config + i18n
 *   EntityLabel   Payment           singular human copy
 */
export function deriveModuleNames(rawId, entityOverride) {
  const moduleId = kebab(rawId)
  const singular = kebab(entityOverride ?? singularize(moduleId))
  const plural = kebab(pluralize(singular))

  return {
    moduleId,
    Entity: pascal(singular),
    entity: camel(singular),
    Entities: pascal(plural),
    entities: camel(plural),
    ENTITY: screaming(singular),
    ENTITIES: screaming(plural),
    Label: title(moduleId),
    EntityLabel: title(singular),
  }
}
