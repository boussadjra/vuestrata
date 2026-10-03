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

/**
 * What a form does with its values once they are valid: usually a mutation.
 *
 * `UiForm` awaits it, so `isSubmitting` stays true until the save has
 * finished. What it resolves with is handed to the `success` event; what it
 * rejects with is shown on the form and handed to the `error` event, and never
 * thrown any further.
 */
export type FormAction = (values: Record<string, unknown>) => unknown

/**
 * Turns one of the backend's field keys (`Items[0].Name`, `contact_name`) into
 * the path of the field it belongs to in this form (`items.0.name`,
 * `contactName`).
 */
export type FormFieldPathStrategy = (key: string) => string

/**
 * When a field shows what the schema says is wrong with it.
 *
 *   always  — as soon as it is wrong, which for an empty required field is
 *             the moment the form opens
 *   touched — once the user has left the field, or tried to submit
 *
 * What the server said about a field is shown either way.
 */
export type FormErrorVisibility = 'always' | 'touched'

export interface FormProps {
  schema?: StandardSchemaV1
  initialValues?: Record<string, unknown>
  disabled?: boolean
  disableHtmlValidation?: boolean
  /** Awaited on a valid submit, instead of the `submit` event. */
  action?: FormAction
  /**
   * After the action succeeds, put the form back to its initial values. Without
   * it the saved values become the new baseline, so the form is clean either way.
   */
  resetOnSuccess?: boolean
  /** Ask before a navigation, a reload or a closed tab discards unsaved changes. */
  confirmLeave?: boolean
  /** Where a backend field key goes when the default guess is wrong: `{ 'Address.City': 'city' }`. */
  fieldMap?: Record<string, string>
  /** Replaces the default way a backend field key becomes a field path. */
  fieldPath?: FormFieldPathStrategy
  showErrors?: FormErrorVisibility
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
