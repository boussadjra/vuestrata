import { useTextField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface TextFieldProps extends FieldProps {
  modelValue?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'
  placeholder?: string
  hint?: string
  autocomplete?: string
  minLength?: number | `${number}`
  maxLength?: number | `${number}`
}

export function useBaseTextField(props: TextFieldProps) {
  const formwerk = useTextField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    type: () => props.type,
    placeholder: () => props.placeholder,
    autocomplete: () => props.autocomplete,
    minLength: () => props.minLength,
    maxLength: () => props.maxLength,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)
  const controlId = computed(() => props.id ?? formwerk.controlId)
  const errorId = computed(() => `${controlId.value}-e`)
  const descriptionId = computed(() => `${controlId.value}-d`)

  const inputProps = computed(() => {
    if (!props.id) return formwerk.inputProps.value

    return {
      ...formwerk.inputProps.value,
      id: controlId.value,
      'aria-errormessage': displayError.value ? errorId.value : undefined,
      'aria-describedby':
        !displayError.value && (props.hint || props.description) ? descriptionId.value : undefined,
    }
  })

  const labelProps = computed(() => {
    if (!props.id) return formwerk.labelProps.value
    return { ...formwerk.labelProps.value, for: controlId.value }
  })

  const errorMessageProps = computed(() => {
    if (!props.id) return formwerk.errorMessageProps.value
    return { ...formwerk.errorMessageProps.value, id: errorId.value }
  })

  const descriptionProps = computed(() => {
    if (!props.id) return formwerk.descriptionProps.value
    return { ...formwerk.descriptionProps.value, id: descriptionId.value }
  })

  return { ...formwerk, inputProps, labelProps, errorMessageProps, descriptionProps, displayError }
}
