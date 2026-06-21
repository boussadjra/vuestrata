import { describe, it, expect, vi } from 'vite-plus/test'

import { useFormBuilder } from '@/composables/useFormBuilder'
import type { FormFieldDefinition } from '~/types'

// Mock @formwerk/core — useForm context for unit tests without Vue component setup
vi.mock('@formwerk/core', () => ({
  useForm: (opts: Record<string, unknown>) => {
    const initialValues = {
      ...(opts.initialValues as Record<string, unknown> | undefined),
    }
    const values: Record<string, unknown> = { ...initialValues }
    const errors: Record<string, string | undefined> = {}
    const dirty = { value: false }
    const wasSubmitted = { value: false }

    return {
      context: {
        id: 'mock-form',
        initialValues,
      },
      values,
      getError: (name: string) => errors[name],
      setValue: (name: string, value: unknown) => {
        values[name] = value
        dirty.value = true
      },
      handleSubmit:
        (onSubmit: (data: { toObject: () => Record<string, unknown> }) => Promise<void>) =>
        async () => {
          wasSubmitted.value = true
          await onSubmit({ toObject: () => ({ ...values }) })
        },
      reset: async (next?: { value?: Record<string, unknown> }) => {
        const target = { ...(next?.value ?? initialValues) }
        for (const key of Object.keys(values)) {
          delete values[key]
        }
        Object.assign(values, target)
        dirty.value = false
      },
      isSubmitting: { value: false },
      wasSubmitted,
      isDirty: () => dirty.value,
      isTouched: () => false,
      isValid: () => true,
    }
  },
}))

const testFields: FormFieldDefinition[] = [
  { name: 'name', type: 'text', label: 'Name', required: true },
  { name: 'email', type: 'email', label: 'Email', required: true },
  { name: 'bio', type: 'textarea', label: 'Bio' },
  {
    name: 'role',
    type: 'select',
    label: 'Role',
    options: [{ label: 'Admin', value: 'admin' }],
  },
  { name: 'active', type: 'switch', label: 'Active' },
]

describe('useFormBuilder', () => {
  it('should initialize with default values', () => {
    const form = useFormBuilder({ fields: testFields })
    expect(form.values.name).toBe('')
    expect(form.values.email).toBe('')
    expect(form.values.active).toBe(false)
  })

  it('should accept initial values', () => {
    const form = useFormBuilder({
      fields: testFields,
      initialValues: { name: 'John', email: 'john@test.com' },
    })
    expect(form.values.name).toBe('John')
    expect(form.values.email).toBe('john@test.com')
  })

  it('should generate fields with error states', () => {
    const form = useFormBuilder({ fields: testFields })
    expect(form.fields.value).toHaveLength(5)
    expect(form.fields.value[0]!.error).toBeUndefined()
  })

  it('should set field values', () => {
    const form = useFormBuilder({ fields: testFields })
    form.setFieldValue('name', 'Jane')
    expect(form.values.name).toBe('Jane')
    expect(form.isDirty()).toBe(true)
  })

  it('should reset form', async () => {
    const form = useFormBuilder({
      fields: testFields,
      initialValues: { name: 'John' },
    })
    form.setFieldValue('name', 'Jane')
    await form.reset()
    expect(form.values.name).toBe('John')
    expect(form.isDirty()).toBe(false)
  })

  it('should call onSubmit when validation passes', async () => {
    const onSubmit = vi.fn()
    const form = useFormBuilder({
      fields: testFields,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalled()
    expect(form.wasSubmitted.value).toBe(true)
  })

  it('should expose formContext from Formwerk', () => {
    const form = useFormBuilder({ fields: testFields })
    expect(form.formContext).toBeDefined()
    expect(form.formContext.id).toBe('mock-form')
  })

  it('should pass initialValues to Formwerk form context', () => {
    const form = useFormBuilder({
      fields: testFields,
      initialValues: { name: 'Alice', email: 'alice@test.com' },
    })
    expect(form.formContext).toBeDefined()
    expect(form.formContext.id).toBe('mock-form')
  })

  it('should track dirty state per field change', () => {
    const form = useFormBuilder({ fields: testFields })
    expect(form.isDirty()).toBe(false)
    form.setFieldValue('name', 'Test')
    expect(form.isDirty()).toBe(true)
  })
})
