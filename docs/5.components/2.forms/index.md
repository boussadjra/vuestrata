---
title: Forms Overview
description: Architecture, shell components, and common props for the Vuestrata form system.
---

# Forms

Vuestrata provides a layered form system powered by [Formwerk](https://formwerk.dev), a headless Vue 3 form library built on the Web platform. Every form element is accessible, keyboard-navigable, and backed by the repo's Reka-based `Ui*` wrappers.

::component-showcase{name="forms"}
::

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Your page / component                                      │
│                                                             │
│  ┌───────────────────┐   ┌────────────────────────────────┐ │
│  │  UiForm / shell   │   │  useFormBuilder()              │ │
│  │  components       │   │  config-driven generation      │ │
│  └────────┬──────────┘   └───────────────┬────────────────┘ │
│           │                              │                  │
│  ┌────────▼──────────────────────────────▼────────────────┐ │
│  │  Ui* field wrappers  (UiTextField, UiSelect, …)        │ │
│  │       public component contract                         │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │  Shared base components (BaseTextFieldInput, …)        │ │
│  │       shared rendering + Formwerk integration          │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────▼───────────────────────────┐ │
│  │  Formwerk composables  (useTextField, useSelect, …)    │ │
│  │       headless a11y engine, fully unstyled             │ │
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

Wraps Formwerk's `useForm`. Provides schema validation, an awaited submit with the server's errors put on the fields they are about, an unsaved-changes guard, and reactive state via slot props.

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

| Prop                    | Type                      | Default    | Description                                                                                                         |
| ----------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `schema`                | `StandardSchemaV1`        | —          | Validation schema (Zod)                                                                                             |
| `initialValues`         | `Record<string, unknown>` | —          | Starting values; establishes dirty-tracking baseline. Read once, when the form mounts                               |
| `disabled`              | `boolean`                 | `false`    | Disables every field in the form                                                                                    |
| `disableHtmlValidation` | `boolean`                 | `true`     | Suppresses browser-native validation popups                                                                         |
| `action`                | `(values) => unknown`     | —          | Awaited on a valid submit, instead of the `submit` event. See [The submit lifecycle](#the-submit-lifecycle)         |
| `resetOnSuccess`        | `boolean`                 | `false`    | After the action succeeds, go back to the initial values rather than keeping what was saved                         |
| `confirmLeave`          | `boolean`                 | `false`    | Ask before a navigation, a reload or a closed tab discards unsaved changes. See [Unsaved changes](#unsaved-changes) |
| `fieldMap`              | `Record<string, string>`  | —          | Backend field key → form field path, for the keys the default cannot match                                          |
| `fieldPath`             | `(key: string) => string` | —          | Replaces the default way a backend field key becomes a field path                                                   |
| `showErrors`            | `'always' \| 'touched'`   | `'always'` | When a field shows what the schema says is wrong with it. See [When errors appear](#when-errors-appear)             |

#### Events

| Event     | Payload                   | When                                                                 |
| --------- | ------------------------- | -------------------------------------------------------------------- |
| `submit`  | `values`                  | A valid submit, on a form with no `action`. Not awaited              |
| `success` | `result, values`          | The `action` resolved. `result` is what it resolved with             |
| `error`   | `error: AppError, values` | The `action` rejected. The error is normalized and already on screen |

#### Default slot props

| Prop           | Type                      | Description                                                                             |
| -------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `values`       | `Record<string, unknown>` | Live reactive copy of all field values                                                  |
| `isSubmitting` | `boolean`                 | `true` from the submit until validation and the `action` have both finished             |
| `wasSubmitted` | `boolean`                 | `true` once a valid submit has run its handler                                          |
| `isDirty`      | `boolean`                 | Any field value differs from the baseline: `initialValues`, or the last successful save |
| `isTouched`    | `boolean`                 | Any field has been interacted with                                                      |
| `isValid`      | `boolean`                 | The schema accepts the current values. A server message does not make it `false`        |
| `formErrors`   | `string[]`                | What to show for the form as a whole after a failed save. Empty when nothing failed     |
| `submitError`  | `AppError \| null`        | The error the last `action` rejected with                                               |

#### Exposed through a template ref

Everything in the slot is exposed too (`isDirty`, `isTouched` and `isValid` as
functions that take an optional field path), plus:

| Member              | Description                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `setErrors(map)`    | Show messages by field path: `{ email: 'Already registered.' }`. The empty key is the form itself   |
| `clearErrors()`     | Remove every message `setErrors` or a failed `action` put there                                     |
| `setValues(values)` | Set some values. The baseline is untouched, so the form becomes dirty where a value differs from it |
| `reset(values?)`    | Back to the baseline; with `values`, those become the baseline. Clears the server's messages        |
| `formErrors`        | As in the slot                                                                                      |
| `submitError`       | As in the slot                                                                                      |

`context`, Formwerk's own form context, is still exposed for the cases above do
not cover. Formwerk is pre-1.0 and its API moves; prefer the members in the
table, which do not.

For config-driven forms, open the [Form Builder guide](/docs/components/forms/form-builder).

Find it in the sidebar: Components > Forms > Form Builder.

---

## The submit lifecycle

A form that saves to a backend has more states than "valid" and "invalid". The
save takes time, it can be refused, the refusal is usually about one field, and
the user may try to leave halfway through. Give `UiForm` an `action` and it
runs that lifecycle:

```html
<script setup lang="ts">
  import { customerDraftSchema } from '../types'
  import { useCustomerForm } from '../composables/useCustomerForm'

  const { initialValues, save } = useCustomerForm(id)
</script>

<template>
  <UiForm
    :schema="customerDraftSchema"
    :initial-values="initialValues"
    :action="save"
    show-errors="touched"
    confirm-leave
    @success="onSaved"
  >
    <template #default="{ formErrors, isSubmitting }">
      <UiAlert v-if="formErrors.length > 0" variant="error" title="Could not save">
        <p v-for="message in formErrors" :key="message">{{ message }}</p>
      </UiAlert>

      <UiTextField name="company" label="Company" required />
      <UiTextField name="email" label="Email" type="email" required />

      <UiButton type="submit" variant="primary" :loading="isSubmitting" :disabled="isSubmitting">
        Save
      </UiButton>
    </template>
  </UiForm>
</template>
```

What happens on submit, in order:

1. **Validate.** The schema runs. If it rejects the values, the messages appear
   under their fields and the action is not called.
2. **Await the action.** `isSubmitting` is `true` until it settles, so a pending
   button stays pending for the whole save. A second submit in that time is
   ignored.
3. **On success**, the saved values become the baseline the form is compared
   against: `isDirty` is `false`, and the unsaved-changes guard lets a
   navigation through. A field the user edited while the request was in flight
   stays dirty. `success` is emitted with what the action resolved with.
4. **On failure**, the rejection is caught. The server's messages go under the
   fields they are about, `formErrors` carries the rest, and `error` is emitted.
   The form is ready to be submitted again.

`action` is usually a mutation's `mutateAsync`, wrapped in a module composable
so the page stays a thin adapter (see `src/modules/customers/composables/useCustomerForm.ts`).
It should let a failure reject: catching it there hides it from the form.

### What is reported

A request the server refused (any `4xx`) is an answer, not a crash. It is shown
to the user and **not** sent to the error reporter. Anything else, a `5xx`, a
response that broke its contract, a bug in the action, is reported once (source
`form:action`) and shown as the generic localized message; a `5xx`'s own text
never reaches the user.

Without an `action` the form emits `submit` and waits for nothing, exactly as
before. In that mode a handler that throws, or returns a promise that rejects,
is an unhandled error: Vue reports it, and the form shows nothing.

### Server errors on fields

The API client reads a refused request's body into `AppError.details`, keyed by
the **backend's** field path, exactly as it was sent:

| Backend               | A key it sends      |
| --------------------- | ------------------- |
| ASP.NET               | `Items[0].Quantity` |
| Laravel               | `contact_name`      |
| Django REST Framework | `items.1.qty`       |
| Vuestrata's own shape | `email`             |

`UiForm` finds the field each key belongs to by trying, in order:

1. the form's `fieldMap`, by the exact key;
2. the key as sent, with bracket indices written as dots (`Items.0.Quantity`),
   for a form that names its fields the way the backend does;
3. every segment in camelCase (`items.0.quantity`, `contactName`), which is what
   a form written in TypeScript uses.

The first candidate that is a field **this form is showing** wins. So most
forms need no configuration, and the `fieldMap` is for the names only a person
can match:

```html
<UiForm :action="save" :field-map="{ 'Address.City': 'city', primary_contact: 'contactName' }" />
```

If your backend's convention is regular but not one of the above, give the form
a function instead. It replaces steps 2 and 3:

```html
<UiForm :action="save" :field-path="(key) => key.replace(/^data\./, '')" />
```

Both are per form. There is no project-wide setting: wrap the function in a
composable of your own and pass it where you need it.

A key that matches no field is **not dropped**. Its messages go to `formErrors`,
prefixed with the key (`vat_number: The VAT number is not valid.`), so the user
still sees them and you see which mapping is missing. The same happens for a
field that exists in `initialValues` but is not rendered.

Other things worth knowing:

- Only a `4xx` is mapped. A contract mismatch also carries `details`, but they
  are paths into the response, not form fields.
- A server message clears when the user edits **that** field. Editing another
  field leaves it alone, even though the schema is validated again.
- A server message never blocks a resubmit, and `isValid` ignores it: the server
  refused what was sent, and what is in the field now may be different.
- Messages are text. Markup in a message is displayed, never rendered.
- `formErrors` is never empty after a failed save. With no form-level message
  from the server it holds the one line `describeError()` gives for the error
  (the backend's own message for a `4xx`, otherwise a translation), so render it
  and the failure is always visible.

To show errors you obtained some other way, call `setErrors` on a template ref.
For a form built without `UiForm`, `useServerErrors()` from
`@/composables/forms` holds the same state: pass `errorsFor('email')[0]` to the
field's `error` prop.

### When errors appear

By default a field shows what the schema says the moment it is wrong, which for
an empty required field is the moment the form opens. That suits a form
pre-filled with data to correct. For a form that starts empty, set
`show-errors="touched"`: a field's message is held back until the user has left
that field, or has tried to submit. What the server said is shown either way.

### Unsaved changes

`confirm-leave` asks before changes are thrown away:

- **A navigation inside the app** is held, and `UiUnsavedChangesDialog` asks
  "Discard unsaved changes?". Keep editing cancels the navigation; Discard
  changes lets it through. Escape and the overlay mean keep editing. A change of
  query or hash on the same page is not a navigation away, and is not asked
  about.
- **A reload, a closed tab or a typed address** gets the browser's own prompt.
  No page can put its own dialog there. The `beforeunload` listener exists only
  while the form is dirty.

Nothing is asked when the form is clean, which includes right after a successful
`action`. So `@success="router.push(...)"` navigates without a prompt.

The guard is also a composable, for a form that is not a `UiForm`:

```html
<script setup lang="ts">
  import { UiUnsavedChangesDialog } from '@/components/ui'
  import { useUnsavedChangesGuard } from '@/composables/forms'

  const guard = useUnsavedChangesGuard(() => isDirty.value, { enabled: () => !isReadOnly.value })
</script>

<template>
  <UiUnsavedChangesDialog :open="guard.isPrompting.value" @stay="guard.stay" @leave="guard.leave" />
</template>
```

Render the dialog whenever you use the composable. A held navigation with
nothing on screen to answer it is a link that silently does nothing.

### Localized validation messages

A schema needs no messages of its own. Zod's issues are answered from the
`validation.*` keys of the locale catalog, in the active language, with limits
interpolated and plural forms chosen:

| Schema                         | English                            | French                                      |
| ------------------------------ | ---------------------------------- | ------------------------------------------- |
| `z.string()` left empty        | This field is required             | Ce champ est requis                         |
| `z.string().min(1)` on `''`    | This field is required             | Ce champ est requis                         |
| `z.string().min(3)`            | Must be at least 3 characters      | Doit contenir au moins 3 caractères         |
| `z.string().max(1)`            | Must be at most 1 character        | Doit contenir au plus 1 caractère           |
| `z.email()`                    | Please enter a valid email address | Veuillez saisir une adresse e-mail valide   |
| `z.number().min(5)`            | Value must be at least 5           | La valeur doit être supérieure ou égale à 5 |
| `z.array(…).min(2)`            | Must contain at least 2 items      | Doit contenir au moins 2 éléments           |
| `z.enum([…])` with a bad value | Please select a valid option       | Veuillez sélectionner une option valide     |

The map is installed once at boot (`installValidationMessages()` in
`src/modules/app/bootstrap/`), and reads the active locale each time it is
asked, so switching language changes the next validation with no reload.

- **To reword a message for every form**, override it in
  `<locale>.overrides.json`: `{ "validation": { "required": "{field} is missing" } }`.
  `validation` is a group, and `plugins/i18n.ts` merges a group key by key, so
  the other messages stay as shipped.

  That file is yours, and this holds for the `withOverrides()` in it that
  1.1.0 ships. A project upgraded from 1.0 has it too unless it had rewritten
  the function, in which case `vuestrata upgrade` left it alone and said so:
  a `withOverrides()` that still returns `{ ...base, ...overrides }` replaces
  the whole group, and every message you did not repeat is shown as its key
  (`validation.email`). Until you change the function, copy the whole
  `validation` object from the catalog into the overrides file and edit the
  entries you want.

- **A message set in the schema wins**: `z.string().min(2, t('profile_name_short'))`
  says what it says. Build the schema in a `computed` when its messages are
  translated, so they follow the locale.
- **In a test**, the map is not installed unless the test installs it:
  `installValidationMessages()` returns the function that removes it again.

---

### UiFormGroup

Groups related fields under a `<fieldset>` with a shared legend, optional group-level validation, and cascading disabled state.

```html
<UiForm :initial-values="{ address: { street: '', city: '', zip: '' } }">
  <UiFormGroup name="address" label="Shipping address">
    <template #default="{ errors }">
      <UiTextField name="street" label="Street" placeholder="123 Main St" required />
      <div class="grid grid-cols-2 gap-4">
        <UiTextField name="city" label="City" placeholder="New York" required />
        <UiTextField name="zip" label="ZIP code" placeholder="10001" />
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

Fields inside a group are named relative to it: `name="street"` above is `address.street` in the form's values. The same holds inside `UiFormRepeater`, where `name="email"` in the second row is `contacts.1.email`. That full path is also where a server error for the field is looked up.

---

### UiFormRepeater

Renders a dynamic list of repeated field groups with add, remove, and reorder controls.

```html
<UiForm :initial-values="{ contacts: [{ name: '', email: '' }] }">
  <UiFormRepeater name="contacts" add-button-label="Add contact" :min="1" :max="5">
    <template #default="{ index, removeButtonProps, moveUpButtonProps, moveDownButtonProps }">
      <div class="flex gap-2 items-end">
        <UiTextField name="name" label="Name" placeholder="Contact name" />
        <UiTextField name="email" label="Email" type="email" placeholder="contact@example.com" />
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

1. **`error` prop** — a string from the parent. It stays until the parent removes it
2. **The server's message** — what a failed `UiForm` `action` said about this field. It stays until the user edits the field
3. **Formwerk validation** — errors surfaced by the field's own Formwerk composable
4. **Form schema** — errors propagated from the parent `UiForm` schema

The first non-empty error renders in a `<p role="alert">` below the field, and the control gets `aria-invalid` and `aria-errormessage` pointing at it. When an error is showing, hint/description is hidden.

You rarely need the `error` prop for server errors: give the form an `action` and they arrive on their fields by themselves. See [Server errors on fields](#server-errors-on-fields).

---

## Ui wrapper architecture

Every `Ui*` form component is a thin public wrapper over a shared base component:

```
UiTextField
  └─ UiTextField.vue
       └─ base/BaseTextFieldInput.vue
```

That split keeps imports stable for consumers while centralizing Formwerk bindings, labels, hints, and error rendering in the base layer.

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
