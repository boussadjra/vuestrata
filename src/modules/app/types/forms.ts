import type { StandardSchemaV1 } from '@standard-schema/spec'

// ─── Field Types ─────────────────────────────────────────
export type FormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'search'
  | 'tel'
  | 'url'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'switch'
  | 'toggle'
  | 'combobox'
  | 'autocomplete'
  | 'tags'
  | 'file'
  | 'otp'
  | 'slider'
  | 'range-slider'
  | 'date'
  | 'date-range'
  | 'datetime'
  | 'time'
  | 'time-range'
  | 'month'
  | 'month-range'
  | 'year'
  | 'year-range'
  | 'color'
  | 'editable'
  | 'tree-select'
  | 'mentions'
  | 'rating'
  | 'hidden'

// ─── Base Field Contract ─────────────────────────────────
export interface FieldProps {
  id?: string
  name?: string
  label?: string
  description?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  schema?: unknown
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

// ─── Type-Specific Options ───────────────────────────────
export interface SelectFieldOptions {
  options: { label: string; value: string; disabled?: boolean }[]
  multiple?: boolean
  searchable?: boolean
}

export interface DateFieldOptions {
  formatOptions?: Intl.DateTimeFormatOptions
  calendar?: string
  min?: string
  max?: string
}

export interface NumberFieldOptions {
  min?: number
  max?: number
  step?: number
}

export interface SliderFieldOptions {
  min?: number
  max?: number
  step?: number
}

export interface FileFieldOptions {
  accept?: string
  multiple?: boolean
  maxSize?: number
}

export interface OtpFieldOptions {
  length?: number
}

export interface TagsFieldOptions {
  maxTags?: number
  allowCustom?: boolean
  options?: { label: string; value: string }[]
}

export interface RatingFieldOptions {
  max?: number
}

// ─── Discriminated Config Union ──────────────────────────
export type FormFieldConfig =
  | {
      type:
        | 'text'
        | 'email'
        | 'password'
        | 'search'
        | 'tel'
        | 'url'
        | 'textarea'
        | 'hidden'
        | 'color'
        | 'editable'
        | 'mentions'
    }
  | { type: 'number'; numberOptions?: NumberFieldOptions }
  | {
      type: 'select' | 'combobox' | 'autocomplete' | 'tree-select'
      selectOptions: SelectFieldOptions
    }
  | { type: 'checkbox' | 'radio' | 'switch' | 'toggle' }
  | {
      type:
        | 'date'
        | 'date-range'
        | 'datetime'
        | 'time'
        | 'time-range'
        | 'month'
        | 'month-range'
        | 'year'
        | 'year-range'
      dateOptions?: DateFieldOptions
    }
  | { type: 'slider' | 'range-slider'; sliderOptions?: SliderFieldOptions }
  | { type: 'file'; fileOptions?: FileFieldOptions }
  | { type: 'otp'; otpOptions?: OtpFieldOptions }
  | { type: 'tags'; tagsOptions?: TagsFieldOptions }
  | { type: 'rating'; ratingOptions?: RatingFieldOptions }

// ─── Form Field Definition ───────────────────────────────
export interface FormFieldDefinition extends FieldProps {
  name: string
  type: FormFieldType
  placeholder?: string
  hint?: string
  options?: { label: string; value: string }[]
  colSpan?: 1 | 2 | 3
}

// ─── Form Component Props ────────────────────────────────
export interface FormProps {
  schema?: StandardSchemaV1
  initialValues?: Record<string, unknown>
  disabled?: boolean
  disableHtmlValidation?: boolean
}

export interface FormGroupProps {
  name: string
  label?: string
  schema?: StandardSchemaV1
  disabled?: boolean
}

export interface FormRepeaterProps {
  name: string
  min?: number
  max?: number
  addButtonLabel?: string
  removeButtonLabel?: string
}
