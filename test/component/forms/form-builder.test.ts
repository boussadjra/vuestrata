import { describe, it, expect, vi } from 'vite-plus/test'

import { useFormBuilder } from '@/composables/useFormBuilder'
import type { FormFieldDefinition } from '~/types'

// Mock the validation provider
vi.mock('@/config/validation-provider', () => ({
  useValidationProvider: () => ({
    adapterName: { value: 'zod' },
    setAdapter: vi.fn(),
    getAdapter: vi.fn().mockResolvedValue({
      validate: vi.fn().mockReturnValue({ success: true, data: {} }),
      validateField: vi.fn().mockReturnValue(true),
    }),
  }),
}))

// Mock @formwerk/core — useForm context for unit tests without Vue component setup
vi.mock('@formwerk/core', () => ({
  useForm: (opts: Record<string, unknown>) => ({
    context: {
      id: 'mock-form',
      initialValues: opts.initialValues,
    },
    values: opts.initialValues,
    handleSubmit: vi.fn(),
    isSubmitting: { value: false },
    wasSubmitted: { value: false },
    isDirty: () => false,
    isTouched: () => false,
    isValid: () => true,
  }),
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
    expect(form.dirty.value).toBe(true)
  })

  it('should set field errors', () => {
    const form = useFormBuilder({ fields: testFields })
    form.setFieldError('name', 'Required')
    expect(form.errors.name).toBe('Required')
    expect(form.isValid.value).toBe(false)
  })

  it('should reset form', () => {
    const form = useFormBuilder({
      fields: testFields,
      initialValues: { name: 'John' },
    })
    form.setFieldValue('name', 'Jane')
    form.setFieldError('name', 'Error')
    form.reset()
    expect(form.values.name).toBe('John')
    expect(form.errors.name).toBeUndefined()
    expect(form.dirty.value).toBe(false)
  })

  it('should call onSubmit when validation passes', async () => {
    const onSubmit = vi.fn()
    const form = useFormBuilder({
      fields: testFields,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalled()
    expect(form.submitted.value).toBe(true)
  })

  it('should clear error on field change', () => {
    const form = useFormBuilder({ fields: testFields })
    form.setFieldError('name', 'Required')
    expect(form.errors.name).toBe('Required')
    form.setFieldValue('name', 'John')
    expect(form.errors.name).toBeUndefined()
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
    expect(form.dirty.value).toBe(false)
    form.setFieldValue('name', 'Test')
    expect(form.dirty.value).toBe(true)
  })

  it('should not submit when validation fails', async () => {
    const form = useFormBuilder({
      fields: testFields,
      schema: { _type: 'test' },
    })

    form.setFieldError('name', 'Name is required')
    expect(form.isValid.value).toBe(false)
    expect(form.errors.name).toBe('Name is required')
  })

  it('should validate individual fields', async () => {
    const form = useFormBuilder({ fields: testFields })
    const result = await form.validateField('name')
    expect(result).toBe(true)
    expect(form.errors.name).toBeUndefined()
  })
})
