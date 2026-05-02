---
title: Forms Overview
description: Architecture, shell components, and common props for the Vuestrata form system.
---

# Forms

Vuestrata provides a layered form system powered by [Formwerk](https://formwerk.dev), a headless Vue 3 form library built on the Web platform. Every form element is accessible, keyboard-navigable, and provider-swappable.

::component-showcase{name="forms"}
::

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Your page / component                                       │
│                                                             │
│  ┌───────────────────┐   ┌────────────────────────────────┐ │
│  │  UiForm / shell   │   │  useFormBuilder()              │ │
│  │  components       │   │  config-driven generation      │ │
│  └────────┬──────────┘   └───────────────┬────────────────┘ │
│           │                              │                   │
│  ┌────────▼──────────────────────────────▼────────────────┐ │
│  │  Ui* field wrappers  (UiTextField, UiSelect, …)        │ │
│  │       resolve the active provider at runtime           │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │  Provider components  (reka/ or vuetify0/)              │ │
│  │       styling layer — Tailwind CSS / Vuetify           │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │  Formwerk composables  (useTextField, useSelect, …)     │ │
│  │       headless a11y engine, fully unstyled              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Three entry points, same underlying engine:

| Entry point                                                      | When to use                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| **Shell components** (`UiForm`, `UiFormGroup`, `UiFormRepeater`) | Structure a form around individual Ui\* field components        |
| **`useFormBuilder()` + `UiFormBuilder`**                         | Config-driven forms — define fields as data, render dynamically |
| **Individual `Ui*` fields**                                      | Cherry-pick a single field outside a form context               |

### How labels, hints, and errors render

Every field follows the same visual structure. Understanding this pattern makes all 35 field types predictable:

```html
<!-- Internal rendering (you don't write this — the provider does) -->
<div class="flex flex-col gap-1">
  <!-- 1. Label — rendered when you pass the `label` prop -->
  <label class="text-sm font-medium text-surface-700 dark:text-surface-300">
    Email address
    <span v-if="required" class="text-red-500 ml-0.5">*</span>
  </label>

  <!-- 2. The control itself (input, select, etc.) -->
  <input type="email" … />

  <!-- 3. Error OR hint (error wins, mutually exclusive) -->
  <p v-if="error" class="text-xs text-red-500" role="alert">Invalid email</p>
  <p v-else-if="hint" class="text-xs text-surface-500">We'll never share your email</p>
</div>
```

**Always pass `label`** to every field — it controls the visible `<label>` element, the `for`/`id` association for screen readers, and the required `*` indicator.

---

## Shell components

### UiForm

Wraps Formwerk's `useForm`. Provides schema validation, submit handling, and reactive state via slot props.

```html
<template>
  <UiForm :schema="schema" :initial-values="{ name: '', email: '' }" @submit="onSubmit">
    <template #default="{ values, isDirty, isSubmitting, isValid, wasSubmitted, isTouched }">
      <UiTextField name="name" label="Full name" placeholder="John Doe" required />
      <UiTextField
        name="email"
        label="Email address"
        type="email"
        placeholder="john@example.com"
        required
      />

      <UiAlert v-if="!isValid && wasSubmitted" variant="error">
        Please fix the errors above before submitting.
      </UiAlert>

      <UiAlert v-if="isTouched && !isValid" variant="warning">
        Some fields still need attention.
      </UiAlert>

      <div class="flex gap-3">
        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Saving…' : isDirty ? 'Save changes' : 'Submit' }}
        </button>
      </div>
    </template>
  </UiForm>
</template>
```

#### Props

| Prop                    | Type                      | Default | Description                                          |
| ----------------------- | ------------------------- | ------- | ---------------------------------------------------- |
| `schema`                | `StandardSchemaV1`        | —       | Validation schema (Zod, Valibot, Yup, ArkType)       |
| `initialValues`         | `Record<string, unknown>` | —       | Starting values; establishes dirty-tracking baseline |
| `disabled`              | `boolean`                 | `false` | Disables every field in the form                     |
| `disableHtmlValidation` | `boolean`                 | `true`  | Suppresses browser-native validation popups          |

#### Default slot props

| Prop           | Type                       | Description                                  |
| -------------- | -------------------------- | -------------------------------------------- |
| `values`       | `Record<string, unknown>`  | Live reactive copy of all field values       |
| `isSubmitting` | `boolean`                  | `true` while the submit handler is running   |
| `wasSubmitted` | `boolean`                  | `true` after the first submit attempt        |
| `isDirty`      | `boolean`                  | Any field value differs from `initialValues` |
| `isTouched`    | `boolean`                  | Any field has been interacted with           |
| `isValid`      | `boolean`                  | All fields pass validation                   |

For full step-by-step form management usage, open [Form Builder guide](/docs/components/forms/form-builder).

Find it in the sidebar: Components > Forms > Form Builder.

---

### UiFormGroup

Groups related fields under a `<fieldset>` with a shared legend, optional group-level validation, and cascading disabled state.

```html
<UiForm :initial-values="{ address: { street: '', city: '', zip: '' } }">
  <UiFormGroup name="address" label="Shipping address">
    <template #default="{ errors }">
      <UiTextField name="address.street" label="Street" placeholder="123 Main St" required />
      <div class="grid grid-cols-2 gap-4">
        <UiTextField name="address.city" label="City" placeholder="New York" required />
        <UiTextField name="address.zip" label="ZIP code" placeholder="10001" />
      </div>
      <p v-if="errors.length" class="text-sm text-red-500">{{ errors[0] }}</p>
    </template>
  </UiFormGroup>
</UiForm>
```

#### Props

| Prop       | Type               | Default      | Description                                  |
| ---------- | ------------------ | ------------ | -------------------------------------------- |
| `name`     | `string`           | **required** | Dot-path prefix applied to all nested fields |
| `label`    | `string`           | —            | `<legend>` text                              |
| `schema`   | `StandardSchemaV1` | —            | Group-level cross-field validation           |
| `disabled` | `boolean`          | `false`      | Disables all fields within this group        |

---

### UiFormRepeater

Renders a dynamic list of repeated field groups with add, remove, and reorder controls.

```html
<UiForm :initial-values="{ contacts: [{ name: '', email: '' }] }">
  <UiFormRepeater name="contacts" add-button-label="Add contact" :min="1" :max="5">
    <template #default="{ index, removeButtonProps, moveUpButtonProps, moveDownButtonProps }">
      <div class="flex gap-2 items-end">
        <UiTextField :name="`contacts[${index}].name`" label="Name" placeholder="Contact name" />
        <UiTextField
          :name="`contacts[${index}].email`"
          label="Email"
          type="email"
          placeholder="contact@example.com"
        />
        <button v-bind="removeButtonProps" class="btn-icon">✕</button>
      </div>
    </template>

    <template #add="{ add, addButtonProps }">
      <button v-bind="addButtonProps" class="btn-outline" @click="add">+ Add contact</button>
    </template>
  </UiFormRepeater>
</UiForm>
```

#### Props

| Prop                | Type     | Default      | Description                                 |
| ------------------- | -------- | ------------ | ------------------------------------------- |
| `name`              | `string` | **required** | Array field path                            |
| `min`               | `number` | —            | Minimum entries — remove is disabled at min |
| `max`               | `number` | —            | Maximum entries — add is disabled at max    |
| `addButtonLabel`    | `string` | `'Add item'` | Default add-button label                    |
| `removeButtonLabel` | `string` | `'Remove'`   | Default remove-button label                 |

---

## Common props (all fields)

Every `Ui*` field extends `BaseFieldProps`:

| Prop          | Type                           | Default | Description                                                                     |
| ------------- | ------------------------------ | ------- | ------------------------------------------------------------------------------- |
| `name`        | `string`                       | —       | Field path in form state (dot-notation: `"billing.zip"`)                        |
| `label`       | `string`                       | —       | **Visible label above the field** — renders a `<label>` with `for`/`id` linking |
| `description` | `string`                       | —       | Helper text below the field (hidden when an error is shown)                     |
| `hint`        | `string`                       | —       | Alias for `description` — if both are set, `hint` wins                          |
| `error`       | `string`                       | —       | External error override (displayed in red below the field)                      |
| `disabled`    | `boolean`                      | `false` | Non-interactive, `aria-disabled="true"`                                         |
| `readonly`    | `boolean`                      | `false` | Value shown but cannot be changed                                               |
| `required`    | `boolean`                      | `false` | Renders a red `*` after the label, sets `aria-required="true"`                  |
| `schema`      | `StandardSchemaV1`             | —       | Inline field-level validation schema                                            |
| `size`        | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'`  | Controls padding, font size, and control height                                 |

### Error display priority

1. **`error` prop** — static string from parent, e.g. a server error
2. **Formwerk validation** — errors surfaced by the field's own Formwerk composable
3. **Form schema** — errors propagated from the parent `UiForm` schema

The first non-empty error renders in a `<p role="alert">` below the field. When an error is showing, hint/description is hidden.

---

## Provider architecture

Every `Ui*` component calls `resolveUiComponent(name)` to look up the active provider at runtime:

```
UiTextField
  └─ resolveUiComponent('TextField')
       ├─ reka/RekaTextField.vue     ← default (Tailwind + Formwerk composables)
       └─ vuetify0/V0TextField.vue   ← minimal Vuetify stub
```

Switch the provider globally via `VITE_UI_PROVIDER=vuetify0` or dynamically per session:

```ts
import { useRuntimeConfig } from '~/config/runtime'
const { setProvider } = useRuntimeConfig()
setProvider('reka')
```

### Formwerk composable mapping

| Composable                         | Components                                                               |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `useTextField`                     | TextField, Textarea                                                      |
| `useCheckbox`                      | Checkbox, Toggle                                                         |
| `useSwitch`                        | Switch                                                                   |
| `useRadioGroup` + `useRadio`       | RadioGroup                                                               |
| `useSelect`                        | Select                                                                   |
| `useComboBox` + `useDefaultFilter` | ComboBox                                                                 |
| `useNumberField`                   | NumberField                                                              |
| `useSearchField`                   | SearchField                                                              |
| `useFileField`                     | FileUpload                                                               |
| `useOtpField`                      | OTPField                                                                 |
| `useDateField`                     | DateField, DatePicker, MonthPicker, YearPicker, DatetimePicker           |
| `useTimeField`                     | TimeField                                                                |
| `usePicker`                        | DatePicker, MonthPicker, DatetimePicker                                  |
| `useSlider` + `useSliderThumb`     | Slider, RangeSlider                                                      |
| `useCustomField<T>`                | TagsField, ColorPicker, Editable, MentionsField, RatingField, TreeSelect |
| `useStepFormFlow`                  | SteppedForm                                                              |

---

## Accessibility

All field components deliver WAI-ARIA compliance via Formwerk's accessible bindings:

| Concern             | Implementation                                                |
| ------------------- | ------------------------------------------------------------- |
| Label association   | `for`/`id` linking via `labelProps` from Formwerk             |
| Error announcements | `role="alert"` on error `<p>` element                         |
| Required fields     | `aria-required="true"` on the control + visible `*` indicator |
| Disabled fields     | `aria-disabled="true"`, removed from tab order                |
| Keyboard navigation | Full arrow-key, Enter, Escape, Tab support on all controls    |

### Keyboard navigation

| Component  | Keys                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| All inputs | `Tab` / `Shift+Tab`                                                       |
| Select     | `↑`/`↓` navigate, `Enter` select, `Escape` close                          |
| ComboBox   | Type to filter, `↑`/`↓` navigate list, `Enter` select                     |
| RadioGroup | `↑`/`↓` or `←`/`→` between options                                        |
| Calendar   | Arrow keys move focus, `Enter` select, `Page Up`/`Page Down` change month |
| Slider     | `←`/`→` step, `Home`/`End` min/max                                        |
| OTPField   | Auto-advances on digit; `Backspace` steps back                            |
| Editable   | `Enter` confirm, `Escape` cancel                                          |
