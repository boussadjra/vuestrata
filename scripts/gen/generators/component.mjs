import { camel, pascal } from '../lib/naming.mjs'
import { insertBeforeSentinel, SENTINELS } from '../lib/registry.mjs'

/**
 * Scaffold a `Ui*` wrapper.
 *
 * The wrapper owns markup and the `data-ui` / `data-variant` attributes the
 * theme layer styles against; behaviour lives in a `composables/forms/useUi*.ts`
 * hook when the component is a field. That split is what keeps 69 wrappers from
 * duplicating label/hint/error handling, and it is why `--field` writes two
 * files rather than one.
 *
 * Colour comes from semantic tokens only. The emitted template uses them
 * exclusively, because the no-raw-palette rule would reject `bg-blue-500` and a
 * generator that produced rejected code would be worse than no generator.
 */
export function planComponent({ plan, positional, options }) {
  const raw = positional[0]
  if (!raw) throw new Error('a component name is required, e.g. `vp run gen:component Tag`')

  const base = pascal(raw.replace(/^Ui/, ''))
  if (!base) throw new Error(`"${raw}" is not a usable component name`)

  const componentName = `Ui${base}`
  const dataUi = camel(base)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()

  if (options.field) {
    plan.addFile(
      `src/modules/app/composables/forms/useUi${base}.ts`,
      composableTemplate(base, dataUi),
    )
    plan.addEdit('src/modules/app/composables/forms/index.ts', `export useUi${base}`, (source) =>
      insertBeforeSentinel(
        source,
        SENTINELS.formComposables,
        `export { useUi${base}, type ${base}Props } from './useUi${base}'`,
      ),
    )
  }

  plan.addFile(
    `src/modules/app/components/ui/${componentName}.vue`,
    options.field ? fieldComponentTemplate(base, dataUi) : plainComponentTemplate(base, dataUi),
  )

  plan.addEdit('src/modules/app/components/ui/index.ts', `export ${componentName}`, (source) =>
    insertBeforeSentinel(
      source,
      SENTINELS.uiComponents,
      `export { default as ${componentName} } from './${componentName}.vue'`,
    ),
  )

  plan.addNote(
    `Style it via \`[data-ui='${dataUi}']\` in src/modules/app/styles/app.css rather than utility ` +
      'classes on the element, so themes can override it.',
  )
  plan.addNote(`Add a test at test/component/ui/${camel(base)}.test.ts.`)
  plan.addNote(
    `To document it, add an entry to COMPONENT_DEMO_DOCS in src/modules/app/config/component-docs.ts ` +
      'and a demo page under src/modules/app/pages/components/.',
  )

  return plan
}

function plainComponentTemplate(base, dataUi) {
  return `<script setup lang="ts">
/**
 * Ui${base}.
 *
 * GENERATED SKELETON. Keep the wrapper thin: markup, variants and the
 * \`data-ui\` hook the theme layer styles against. Anything stateful belongs in
 * a composable beside it.
 *
 * Colour must come from semantic tokens (bg-card, text-muted-foreground,
 * border-border, …), never a raw palette utility — see
 * src/modules/app/styles/semantic.css.
 */
export interface ${base}Props {
  variant?: 'default' | 'subtle'
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<${base}Props>(), {
  variant: 'default',
  size: 'md',
})

const sizeClass = computed(
  () => ({ sm: 'text-xs px-2 py-1', md: 'text-sm px-3 py-1.5', lg: 'text-base px-4 py-2' })[props.size],
)
</script>

<template>
  <div :class="sizeClass" :data-variant="variant" data-ui="${dataUi}" class="bg-card text-foreground border-border rounded-md border">
    <slot />
  </div>
</template>
`
}

function fieldComponentTemplate(base, dataUi) {
  return `<script setup lang="ts">
/**
 * Ui${base} — a field wrapper.
 *
 * Behaviour (label, hint, error, validation binding) lives in
 * \`useUi${base}\`; this file is markup and theming hooks only. That is the
 * split every other field in this folder follows.
 */
import { useUi${base}, type ${base}Props } from '@/composables/forms'

const props = withDefaults(defineProps<${base}Props & { provider?: 'reka' }>(), {
  provider: 'reka',
})

const { fieldProps, labelProps, errorMessage, describedBy } = useUi${base}(props)
</script>

<template>
  <div :data-provider="provider" data-ui="${dataUi}" class="flex flex-col gap-1.5">
    <label v-bind="labelProps" class="text-foreground text-sm font-medium">{{ label }}</label>

    <input
      v-bind="fieldProps"
      :aria-describedby="describedBy"
      :aria-invalid="Boolean(errorMessage)"
      class="bg-card text-foreground border-border focus-visible:ring-ring rounded-md border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
    />

    <p v-if="hint && !errorMessage" class="text-muted-foreground text-xs">{{ hint }}</p>
    <p v-if="errorMessage" class="text-destructive text-xs">{{ errorMessage }}</p>
  </div>
</template>
`
}

function composableTemplate(base, dataUi) {
  return `import { useId } from 'vue'

/**
 * Behaviour for \`Ui${base}\`.
 *
 * GENERATED SKELETON. The shape mirrors the other field composables in this
 * folder: take props, return the bindings the wrapper spreads. Wire it to
 * Formwerk (\`useTextField\`, \`useSelect\`, …) when this field needs real
 * validation rather than the local state below.
 */
export interface ${base}Props {
  label: string
  name: string
  modelValue?: string
  hint?: string
  disabled?: boolean
  required?: boolean
}

export function useUi${base}(props: ${base}Props) {
  const id = useId()
  const errorId = \`\${id}-error\`
  const errorMessage = ref('')

  const fieldProps = computed(() => ({
    id,
    name: props.name,
    value: props.modelValue ?? '',
    disabled: props.disabled,
    required: props.required,
  }))

  const labelProps = computed(() => ({ for: id }))

  // Only reference the error node when there is an error to read; pointing
  // aria-describedby at an empty element makes screen readers announce nothing
  // and hides the fact that validation is not wired up.
  const describedBy = computed(() => (errorMessage.value ? errorId : undefined))

  return { fieldProps, labelProps, errorMessage, errorId, describedBy, dataUi: '${dataUi}' }
}
`
}
