import { useForm } from '@formwerk/core'

import type { FormFieldDefinition } from '~/types'

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
  // Build default values from field type hints so formwerk initialises correctly
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

  const initValues = { ...defaultValues, ...options.initialValues }

  // useForm is the only source of form state — no parallel reactive shim.
  const formOptions = options.schema
    ? {
        schema: options.schema,
        initialValues: initValues,
      }
    : { initialValues: initValues }

  const form = useForm(formOptions as Parameters<typeof useForm>[0])

  // Expose field definitions with per-field error merged from formwerk context
  const fields = computed<FormBuilderField[]>(() =>
    options.fields.map((field) => ({
      ...field,
      error: form.getError(field.name),
    })),
  )

  // handleSubmit is formwerk's event handler — bind directly to <form @submit>
  const handleSubmit = form.handleSubmit(async (data) => {
    await options.onSubmit?.(data.toObject() as T)
  })

  function setFieldValue(name: string, value: unknown) {
    form.setValue(name, value as never)
  }

  async function reset(newValues?: Partial<T>) {
    if (newValues) {
      await form.reset({ value: { ...initValues, ...newValues } as Record<string, unknown> })
    } else {
      await form.reset()
    }
  }

  return {
    /** Reactive form values managed by formwerk. */
    values: form.values,
    fields,
    isSubmitting: form.isSubmitting,
    wasSubmitted: form.wasSubmitted,
    isDirty: (...args: Parameters<typeof form.isDirty>) => form.isDirty(...args),
    isTouched: (...args: Parameters<typeof form.isTouched>) => form.isTouched(...args),
    isValid: (...args: Parameters<typeof form.isValid>) => form.isValid(...args),
    /** Pass directly to <form @submit="handleSubmit"> — validates before calling onSubmit. */
    handleSubmit,
    setFieldValue,
    reset,
    formContext: form.context,
  }
}
