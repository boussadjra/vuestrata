import { useFileField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface FileUploadProps extends BaseFieldProps {
  hint?: string
  accept?: string
  multiple?: boolean
  maxSize?: number
}

export function useBaseFileUpload(props: FileUploadProps) {
  const formwerk = useFileField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)
  const files = formwerk.entries

  return { ...formwerk, displayError, files }
}
