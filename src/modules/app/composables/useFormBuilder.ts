import { useForm } from '@formwerk/core'
import type { ZodType, ZodError } from 'zod'

import { useValidationProvider } from '~/config/validation-provider'
import type { FormFieldDefinition, ValidationAdapter } from '~/types'

/** Zod-powered validation adapter for Formwerk */
export function zodValidator<T>(schema: ZodType<T>) {
  return (value: unknown) => {
    const result = schema.safeParse(value)
    if (result.success) return true
    const zodError = result.error as ZodError
    return zodError.issues[0]?.message ?? 'Validation failed'
  }
}

export interface FormBuilderOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  fields: FormFieldDefinition[]
  schema?: unknown
  initialValues?: Partial<T>
  onSubmit?: (values: T) => void | Promise<void>
}

export interface FormBuilderField extends FormFieldDefinition {
  error: string | undefined
}

export function useFormBuilder<T extends Record<string, unknown> = Record<string, unknown>>(
  options: FormBuilderOptions<T>,
) {
  const { getAdapter } = useValidationProvider()

  // Build initial values from fields + overrides
  const defaultValues: Record<string, unknown> = {}
  for (const field of options.fields) {
    if (field.type === 'checkbox' || field.type === 'switch') {
      defaultValues[field.name] = false
    } else if (field.type === 'number') {
      defaultValues[field.name] = undefined
    } else {
      defaultValues[field.name] = ''
    }
  }

  const initValues = { ...defaultValues, ...options.initialValues } as T

  // Formwerk form engine — provides form context for child field composables (008-011).
  // The shim `values` below is the single source of truth until Formwerk fields
  // are wired (specs 008-011). At that point the shim will be removed.
  const { context: formContext } = useForm({
    initialValues: initValues as Record<string, unknown>,
  })

  // Backward-compatible reactive state (single source of truth until Formwerk migration completes)
  const values = reactive<Record<string, unknown>>({ ...initValues }) as T
  const errors = reactive<Record<string, string | undefined>>({})
  const submitting = ref(false)
  const submitted = ref(false)
  const dirty = ref(false)

  // Track field definitions with reactive errors
  const fields = computed<FormBuilderField[]>(() =>
    options.fields.map((field) => ({
      ...field,
      error: errors[field.name],
    })),
  )

  const isValid = computed(() => Object.values(errors).every((e) => !e))

  let adapter: ValidationAdapter | null = null

  async function ensureAdapter(): Promise<ValidationAdapter | null> {
    if (!options.schema) return null
    if (!adapter) adapter = await getAdapter()
    return adapter
  }

  async function validateField(name: string): Promise<boolean> {
    const a = await ensureAdapter()
    if (!a || !options.schema) {
      errors[name] = undefined
      return true
    }
    const result = a.validateField(options.schema, name, values[name as keyof T])
    if (result === true) {
      errors[name] = undefined
      return true
    }
    errors[name] = result
    return false
  }

  async function validate(): Promise<boolean> {
    const a = await ensureAdapter()
    if (!a || !options.schema) return true

    // Clear all errors first
    for (const field of options.fields) {
      errors[field.name] = undefined
    }

    const result = a.validate(options.schema, toRaw(values))
    if (result.success) return true

    for (const err of result.errors) {
      if (!errors[err.path]) {
        errors[err.path] = err.message
      }
    }
    return false
  }

  async function handleSubmit() {
    dirty.value = true
    submitting.value = true

    try {
      const valid = await validate()
      if (!valid) return

      await options.onSubmit?.(toRaw(values) as T)
      submitted.value = true
    } finally {
      submitting.value = false
    }
  }

  function setFieldValue(name: string, value: unknown) {
    ;(values as Record<string, unknown>)[name] = value
    dirty.value = true
    // Clear error on change
    if (errors[name]) {
      errors[name] = undefined
    }
  }

  function setFieldError(name: string, message: string | undefined) {
    errors[name] = message
  }

  function reset(newValues?: Partial<T>) {
    Object.assign(values, defaultValues, newValues ?? options.initialValues)
    for (const key of Object.keys(errors)) {
      errors[key] = undefined
    }
    submitting.value = false
    submitted.value = false
    dirty.value = false
    adapter = null
  }

  return {
    values,
    errors,
    fields,
    submitting: computed(() => submitting.value),
    submitted: computed(() => submitted.value),
    dirty: computed(() => dirty.value),
    isValid,
    validate,
    validateField,
    handleSubmit,
    setFieldValue,
    setFieldError,
    reset,
    formContext,
  }
}
