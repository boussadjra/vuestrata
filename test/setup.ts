import { beforeEach, vi } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

import { resetRuntimeState } from './utils/reset-runtime-state'

const MockUiButton = defineComponent({
  name: 'MockUiButton',
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { attrs, slots, emit }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: (attrs.type as string) || 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
  },
})

const MockUiTextField = defineComponent({
  name: 'MockUiTextField',
  inheritAttrs: false,
  props: {
    id: String,
    modelValue: { type: String, default: '' },
    type: { type: String, default: 'text' },
    label: String,
    error: String,
  },
  emits: ['update:model-value', 'update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('div', {}, [
        props.label ? h('label', {}, props.label) : null,
        h('input', {
          ...attrs,
          id: props.id || (attrs.id as string | undefined),
          type: props.type,
          value: props.modelValue ?? '',
          onInput: (event: Event) => {
            const value = (event.target as HTMLInputElement).value
            emit('update:model-value', value)
            emit('update:modelValue', value)
          },
        }),
        props.error ? h('p', { role: 'alert' }, props.error) : null,
      ])
  },
})

const MockUiSelect = defineComponent({
  name: 'MockUiSelect',
  inheritAttrs: false,
  props: {
    id: String,
    modelValue: { type: [String, Number], default: '' },
    options: {
      type: Array as () => Array<{ label: string; value: string | number }>,
      default: () => [],
    },
  },
  emits: ['update:model-value', 'update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          id: props.id || (attrs.id as string | undefined),
          value: props.modelValue ?? '',
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value
            emit('update:model-value', value)
            emit('update:modelValue', value)
          },
        },
        props.options.map((option) =>
          h('option', { value: option.value }, option.label ?? String(option.value)),
        ),
      )
  },
})

const MockUiToggleGroup = defineComponent({
  name: 'MockUiToggleGroup',
  props: {
    modelValue: { type: [String, Array], default: '' },
    options: {
      type: Array as () => Array<{ label: string; value: string }>,
      default: () => [],
    },
  },
  emits: ['update:model-value', 'update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {},
        props.options.map((option) =>
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                emit('update:model-value', option.value)
                emit('update:modelValue', option.value)
              },
            },
            option.label,
          ),
        ),
      )
  },
})

const MockUiCheckbox = defineComponent({
  name: 'MockUiCheckbox',
  inheritAttrs: false,
  props: {
    checked: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['change', 'update:checked'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        type: 'checkbox',
        checked: props.checked || attrs.checked === '' || attrs.checked === true,
        disabled: props.disabled || attrs.disabled === '' || attrs.disabled === true,
        onChange: (event: Event) => {
          const checked = (event.target as HTMLInputElement).checked
          emit('change', checked)
          emit('update:checked', checked)
        },
      })
  },
})

vi.mock('@/config/ui-provider', () => ({
  resolveUiComponent: (name: string) => {
    switch (name) {
      case 'Button':
        return MockUiButton
      case 'TextField':
        return MockUiTextField
      case 'Select':
        return MockUiSelect
      case 'ToggleGroup':
        return MockUiToggleGroup
      case 'Checkbox':
        return MockUiCheckbox
      default:
        return defineComponent({
          name: `MockUi${name}`,
          inheritAttrs: false,
          setup(_, { attrs, slots }) {
            return () => h('div', attrs, slots.default?.())
          },
        })
    }
  },
}))

// Global matchMedia mock for jsdom environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Reset Pinia + core/lib runtime backends + createGlobalState containers
// before every test so cross-suite leakage of mutable state cannot occur.
beforeEach(async () => {
  await resetRuntimeState()
})
