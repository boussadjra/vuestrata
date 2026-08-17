import { toValue, type MaybeRefOrGetter } from 'vue'

/**
 * Forward Formwerk's element-capturing ref through a headless component.
 *
 * Formwerk's `inputProps` carries a function ref:
 *
 *     ref: (el) => { if (el) inputEl.value = el }
 *
 * It expects a DOM node, and it gets one whenever `inputProps` is spread onto a
 * native element (`<input>`, `<textarea>`) — which is what most of the field
 * wrappers do.
 *
 * Two wrappers spread it onto a Reka *component* instead (`CheckboxRoot`,
 * `Toggle`). Vue hands a function ref on a component vnode the component's
 * public instance, never the element, so Formwerk stored that instance and then
 * called `instance.addEventListener(...)` on it.
 *
 * The failure is quiet in a browser: the throw happens inside a watcher, so
 * Vue's error handling swallows it, the component still paints, and the
 * explicit `@click` handler still toggles. What is lost is every listener
 * Formwerk wanted to attach — validation on blur, keyboard handling, form
 * association — with nothing to show for it. Under Vitest the same throw surfaces
 * as an unhandled rejection and fails the suite, which is how it was found.
 *
 * So: strip `ref` out of the spread, and hand Formwerk the component's `$el`.
 */
export interface FormwerkInputProps extends Record<string, unknown> {
  ref?: (el: unknown) => void
}

export function useFormwerkElementRef(inputProps: MaybeRefOrGetter<FormwerkInputProps>) {
  /** `inputProps` with the function ref removed, safe to `v-bind` to a component. */
  const attrs = computed(() => {
    const { ref: _capture, ...rest } = toValue(inputProps)
    return rest
  })

  /** Bind as `:ref` on the component. Resolves the instance to its root element. */
  function captureElement(instance: unknown) {
    const capture = toValue(inputProps).ref
    if (typeof capture !== 'function') return

    const el = resolveElement(instance)
    // Formwerk's captureFn ignores falsy input, so unmount (instance === null)
    // is a no-op there rather than something we need to special-case.
    if (el) capture(el)
  }

  return { attrs, captureElement }
}

function resolveElement(instance: unknown): HTMLElement | null {
  if (instance instanceof HTMLElement) return instance
  if (instance && typeof instance === 'object' && '$el' in instance) {
    const el = (instance as { $el: unknown }).$el
    return el instanceof HTMLElement ? el : null
  }
  return null
}
