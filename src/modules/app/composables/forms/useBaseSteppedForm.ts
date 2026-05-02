import { useStepFormFlow } from '@formwerk/core'
import type { FormObject } from '@formwerk/core'

export interface SteppedFormProps {
  nextLabel?: string
  previousLabel?: string
}

export function useBaseSteppedForm<T extends FormObject = FormObject>(props?: SteppedFormProps) {
  const flow = useStepFormFlow<T>({
    nextLabel: props?.nextLabel,
    previousLabel: props?.previousLabel,
  })

  return { ...flow }
}
