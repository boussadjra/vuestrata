import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { ref, computed } from 'vue'

// Mock matchMedia
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

// Helper to create a mock ExposedField return from Formwerk composables
function createMockFieldReturn(overrides: Record<string, unknown> = {}) {
  return {
    errorMessage: ref(undefined),
    errors: ref([]),
    submitErrors: ref([]),
    submitErrorMessage: ref(undefined),
    fieldValue: ref(''),
    isDirty: ref(false),
    isTouched: ref(false),
    isBlurred: ref(false),
    isValid: ref(true),
    isValidated: ref(false),
    isDisabled: ref(false),
    setErrors: vi.fn(),
    setTouched: vi.fn(),
    setBlurred: vi.fn(),
    setIsValidated: vi.fn(),
    setValue: vi.fn(),
    validate: vi.fn().mockResolvedValue({
      type: 'FIELD',
      path: '',
      errors: [],
      isValid: true,
    }),
    labelProps: computed(() => ({ id: 'mock-label', for: 'mock-input' })),
    descriptionProps: computed(() => ({ id: 'mock-desc' })),
    errorMessageProps: computed(() => ({
      id: 'mock-error',
      'aria-live': 'polite' as const,
      'aria-atomic': true,
    })),
    ...overrides,
  }
}

// Mock @formwerk/core
vi.mock('@formwerk/core', () => ({
  useTextField: vi.fn((props: Record<string, unknown>) => ({
    ...createMockFieldReturn(),
    controlId: 'mock-text-id',
    inputProps: computed(() => ({
      value:
        typeof props.modelValue === 'function' ? ((props.modelValue as () => string)() ?? '') : '',
      id: 'mock-text-id',
      disabled: typeof props.disabled === 'function' ? (props.disabled as () => boolean)() : false,
      'aria-invalid': false,
      'aria-errormessage': undefined,
      'aria-label': undefined,
      'aria-labelledby': undefined,
      'aria-describedby': undefined,
      maxlength: undefined,
      minlength: undefined,
      pattern: undefined,
    })),
    inputEl: ref(null),
    model: ref(''),
    field: { value: '' },
  })),
  useCheckbox: vi.fn(() => {
    const isChecked = ref(false)
    return {
      ...createMockFieldReturn(),
      controlId: 'mock-checkbox-id',
      inputProps: computed(() => ({
        role: 'checkbox' as const,
        'aria-checked': isChecked.value,
        tabindex: '0' as const,
        'aria-label': undefined,
        'aria-labelledby': undefined,
      })),
      inputEl: ref(null),
      isChecked,
      isGrouped: false,
      toggle: (force?: boolean) => {
        isChecked.value = force ?? !isChecked.value
      },
    }
  }),
  useSwitch: vi.fn(() => {
    const isPressed = ref(false)
    return {
      ...createMockFieldReturn(),
      controlId: 'mock-switch-id',
      inputProps: computed(() => ({
        role: 'switch' as const,
        'aria-checked': isPressed.value,
        id: 'mock-switch-id',
        tabindex: '0' as const,
        'aria-label': undefined,
        'aria-labelledby': undefined,
        'aria-describedby': undefined,
      })),
      inputEl: ref(null),
      isPressed,
      togglePressed: (force?: boolean) => {
        isPressed.value = force ?? !isPressed.value
      },
      field: { value: false },
    }
  }),
  useRadioGroup: vi.fn(() => ({
    ...createMockFieldReturn(),
    groupProps: computed(() => ({
      role: 'radiogroup' as const,
      dir: 'ltr',
      'aria-label': undefined,
      'aria-labelledby': undefined,
      'aria-describedby': undefined,
      'aria-invalid': false,
      'aria-errormessage': undefined,
      onKeydown: vi.fn(),
    })),
    groupId: 'mock-radio-group-id',
  })),
  useRadio: vi.fn((_props: Record<string, unknown>) => ({
    controlId: 'mock-radio-id',
    inputEl: ref(null),
    inputProps: computed(() => ({
      type: 'radio' as const,
      'aria-label': undefined,
      'aria-labelledby': undefined,
    })),
    isChecked: computed(() => false),
    isDisabled: ref(false),
    labelProps: computed(() => ({
      id: 'mock-radio-label',
      for: 'mock-radio-id',
    })),
  })),
  useSearchField: vi.fn((props: Record<string, unknown>) => ({
    ...createMockFieldReturn(),
    controlId: 'mock-search-id',
    inputProps: computed(() => ({
      value:
        typeof props.modelValue === 'function' ? ((props.modelValue as () => string)() ?? '') : '',
      id: 'mock-search-id',
      disabled: false,
      'aria-invalid': false,
      'aria-errormessage': undefined,
      'aria-label': undefined,
      'aria-labelledby': undefined,
      'aria-describedby': undefined,
      maxlength: undefined,
      minlength: undefined,
      pattern: undefined,
      onKeydown: vi.fn(),
    })),
    clearBtnProps: computed(() => ({
      tabindex: '0',
      type: 'button' as const,
      ariaLabel: 'Clear',
      onClick: vi.fn(),
    })),
    inputEl: ref(null),
    model: ref('test'),
    field: { value: '' },
  })),
  useNumberField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-number-id',
    inputProps: computed(() => ({
      id: 'mock-number-id',
      'aria-label': undefined,
      'aria-labelledby': undefined,
      'aria-describedby': undefined,
      'aria-invalid': false,
      'aria-errormessage': undefined,
    })),
    incrementButtonProps: computed(() => ({
      'aria-label': 'Increment',
      tabindex: '0',
      type: 'button' as const,
      disabled: false,
      onMousedown: vi.fn(),
    })),
    decrementButtonProps: computed(() => ({
      'aria-label': 'Decrement',
      tabindex: '0',
      type: 'button' as const,
      disabled: false,
      onMousedown: vi.fn(),
    })),
    increment: vi.fn(),
    decrement: vi.fn(),
    inputEl: ref(null),
    formattedText: ref('0'),
    field: { value: 0 },
  })),
}))

import {
  UiCheckbox,
  UiNumberField,
  UiRadioGroup,
  UiSearchField,
  UiSwitch,
  UiTextarea,
  UiTextField,
  UiToggle,
  UiToggleGroup,
} from '@/components/ui'

describe('Formwerk Basic Fields', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('UiTextField', () => {
    it('renders label and input via Formwerk', () => {
      const wrapper = mount(UiTextField, {
        props: {
          name: 'username',
          label: 'Username',
          placeholder: 'Enter name',
        },
      })
      expect(wrapper.find('label').text()).toContain('Username')
      expect(wrapper.find('input').exists()).toBe(true)
      expect(wrapper.find('[data-ui="textfield"]').exists()).toBe(true)
    })

    it('uses explicit ids for stable label and input bindings', () => {
      const wrapper = mount(UiTextField, {
        props: { id: 'email', name: 'email', label: 'Email' },
      })

      expect(wrapper.find('input').attributes('id')).toBe('email')
      expect(wrapper.find('label').attributes('for')).toBe('email')
    })

    it('shows required indicator', () => {
      const wrapper = mount(UiTextField, {
        props: { name: 'email', label: 'Email', required: true },
      })
      expect(wrapper.find('label').text()).toContain('*')
    })

    it('displays error message', () => {
      const wrapper = mount(UiTextField, {
        props: { name: 'test', label: 'Test', error: 'Required field' },
      })
      expect(wrapper.text()).toContain('Required field')
    })

    it('displays hint text', () => {
      const wrapper = mount(UiTextField, {
        props: { name: 'test', label: 'Test', hint: 'Enter your name' },
      })
      expect(wrapper.text()).toContain('Enter your name')
    })

    it('works standalone without name prop', () => {
      const wrapper = mount(UiTextField, {
        props: { label: 'Standalone' },
      })
      expect(wrapper.find('input').exists()).toBe(true)
    })
  })

  describe('UiTextarea', () => {
    it('renders textarea element', () => {
      const wrapper = mount(UiTextarea, {
        props: { name: 'bio', label: 'Bio', rows: 5 },
      })
      expect(wrapper.find('textarea').exists()).toBe(true)
      expect(wrapper.find('[data-ui="textarea"]').exists()).toBe(true)
      expect(wrapper.find('textarea').attributes('rows')).toBe('5')
    })

    it('shows label text', () => {
      const wrapper = mount(UiTextarea, {
        props: { name: 'notes', label: 'Notes' },
      })
      expect(wrapper.find('label').text()).toContain('Notes')
    })
  })

  describe('UiCheckbox', () => {
    it('renders checkbox with label', () => {
      const wrapper = mount(UiCheckbox, {
        props: { name: 'agree', label: 'I agree' },
      })
      expect(wrapper.find('[data-ui="checkbox"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('I agree')
    })

    it('renders with role=checkbox from Formwerk', () => {
      const wrapper = mount(UiCheckbox, {
        props: { name: 'terms', label: 'Accept terms' },
      })
      const checkbox = wrapper.find('[data-ui="checkbox"]')
      expect(checkbox.attributes('role')).toBe('checkbox')
    })

    it('displays error message', () => {
      const wrapper = mount(UiCheckbox, {
        props: { name: 'agree', label: 'Agree', error: 'Must accept' },
      })
      expect(wrapper.text()).toContain('Must accept')
    })

    it('emits a checked value when toggled from indeterminate', async () => {
      const wrapper = mount(UiCheckbox, {
        props: { label: 'Select all rows', modelValue: 'indeterminate' },
      })

      await wrapper.find('[data-ui="checkbox"]').trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
      expect(wrapper.emitted('change')?.[0]).toEqual([true])
    })
  })

  describe('UiSwitch', () => {
    it('renders switch with role=switch from Formwerk', () => {
      const wrapper = mount(UiSwitch, {
        props: { name: 'notify', label: 'Notifications' },
      })
      expect(wrapper.find('[data-ui="switch"]').exists()).toBe(true)
      expect(wrapper.find('[data-ui="switch"]').attributes('role')).toBe('switch')
    })

    it('shows label text', () => {
      const wrapper = mount(UiSwitch, {
        props: { name: 'dark', label: 'Dark mode' },
      })
      expect(wrapper.text()).toContain('Dark mode')
    })

    it('displays error message', () => {
      const wrapper = mount(UiSwitch, {
        props: { name: 'toggle', label: 'Toggle', error: 'Error' },
      })
      expect(wrapper.text()).toContain('Error')
    })
  })

  describe('UiRadioGroup', () => {
    const options = [
      { label: 'Option A', value: 'a' },
      { label: 'Option B', value: 'b' },
      { label: 'Option C', value: 'c', disabled: true },
    ]

    it('renders radio group with role=radiogroup', () => {
      const wrapper = mount(UiRadioGroup, {
        props: { name: 'choice', label: 'Choose', options },
      })
      expect(wrapper.find('[data-ui="radiogroup"]').exists()).toBe(true)
      expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    })

    it('renders all options', () => {
      const wrapper = mount(UiRadioGroup, {
        props: { name: 'choice', label: 'Choose', options },
      })
      expect(wrapper.text()).toContain('Option A')
      expect(wrapper.text()).toContain('Option B')
      expect(wrapper.text()).toContain('Option C')
    })

    it('shows label', () => {
      const wrapper = mount(UiRadioGroup, {
        props: { name: 'size', label: 'Size', options },
      })
      expect(wrapper.text()).toContain('Size')
    })
  })

  describe('UiSearchField', () => {
    it('renders search input with clear button', () => {
      const wrapper = mount(UiSearchField, {
        props: { name: 'search', label: 'Search' },
      })
      expect(wrapper.find('[data-ui="searchfield"]').exists()).toBe(true)
      expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    })

    it('shows label text', () => {
      const wrapper = mount(UiSearchField, {
        props: { name: 'search', label: 'Search items' },
      })
      expect(wrapper.text()).toContain('Search items')
    })

    it('displays clear button when value exists', () => {
      const wrapper = mount(UiSearchField, {
        props: { name: 'q', label: 'Query', modelValue: 'test' },
      })
      // Clear button should be visible since mock model has value
      expect(wrapper.find('button').exists()).toBe(true)
    })
  })

  describe('UiNumberField', () => {
    it('renders number input with increment/decrement buttons', () => {
      const wrapper = mount(UiNumberField, {
        props: { name: 'qty', label: 'Quantity' },
      })
      expect(wrapper.find('[data-ui="numberfield"]').exists()).toBe(true)
      // Should have decrement and increment buttons
      const buttons = wrapper.findAll('button')
      expect(buttons.length).toBe(2)
    })

    it('shows label text', () => {
      const wrapper = mount(UiNumberField, {
        props: { name: 'price', label: 'Price' },
      })
      expect(wrapper.text()).toContain('Price')
    })

    it('displays error message', () => {
      const wrapper = mount(UiNumberField, {
        props: { name: 'amount', label: 'Amount', error: 'Too large' },
      })
      expect(wrapper.text()).toContain('Too large')
    })
  })

  describe('UiToggle', () => {
    it('renders toggle with checkbox role', () => {
      const wrapper = mount(UiToggle, {
        props: { name: 'bold', label: 'Bold' },
      })
      expect(wrapper.find('[data-ui="toggle"]').exists()).toBe(true)
      expect(wrapper.find('[data-ui="toggle"]').attributes('role')).toBe('checkbox')
    })

    it('shows label text', () => {
      const wrapper = mount(UiToggle, {
        props: { name: 'italic', label: 'Italic' },
      })
      expect(wrapper.text()).toContain('Italic')
    })
  })

  describe('UiToggleGroup', () => {
    const options = [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ]

    it('renders toggle group with all options', () => {
      const wrapper = mount(UiToggleGroup, {
        props: { name: 'align', label: 'Alignment', options },
      })
      expect(wrapper.find('[data-ui="togglegroup"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Left')
      expect(wrapper.text()).toContain('Center')
      expect(wrapper.text()).toContain('Right')
    })

    it('renders buttons with aria-pressed', () => {
      const wrapper = mount(UiToggleGroup, {
        props: {
          name: 'align',
          label: 'Alignment',
          options,
          modelValue: 'center',
        },
      })
      const buttons = wrapper.findAll('button')
      expect(buttons.length).toBe(3)
      // Center should be pressed
      expect(buttons[1]!.attributes('aria-pressed')).toBe('true')
      expect(buttons[0]!.attributes('aria-pressed')).toBe('false')
    })

    it('supports multi-select mode', () => {
      const wrapper = mount(UiToggleGroup, {
        props: {
          name: 'format',
          label: 'Format',
          options,
          modelValue: ['left', 'right'],
          multiple: true,
        },
      })
      const buttons = wrapper.findAll('button')
      expect(buttons[0]!.attributes('aria-pressed')).toBe('true')
      expect(buttons[1]!.attributes('aria-pressed')).toBe('false')
      expect(buttons[2]!.attributes('aria-pressed')).toBe('true')
    })

    it('emits update on click in single-select mode', async () => {
      const wrapper = mount(UiToggleGroup, {
        props: {
          name: 'align',
          label: 'Alignment',
          options,
          modelValue: 'left',
        },
      })
      await wrapper.findAll('button')[1]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['center'])
    })

    it('emits update on click in multi-select mode', async () => {
      const wrapper = mount(UiToggleGroup, {
        props: {
          name: 'format',
          label: 'Format',
          options,
          modelValue: ['left'],
          multiple: true,
        },
      })
      await wrapper.findAll('button')[2]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['left', 'right']])
    })
  })
})
