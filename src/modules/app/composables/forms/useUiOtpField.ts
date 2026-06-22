import { useOtpField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface OTPFieldProps extends Omit<FieldProps, 'size'> {
  hint?: string
  length?: number
  accept?: 'numeric' | 'alphanumeric' | 'all'
}

export function useUiOtpField(props: OTPFieldProps) {
  const formwerk = useOtpField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
    length: () => props.length ?? 6,
    accept: () => props.accept ?? 'numeric',
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)
  const slots = formwerk.fieldSlots

  return { ...formwerk, displayError, slots }
}
