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

vi.mock('@formwerk/core', () => ({
  useSelect: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-select-id',
    triggerProps: computed(() => ({
      id: 'mock-select-id',
      role: 'combobox',
      'aria-expanded': false,
    })),
    listBoxProps: computed(() => ({ role: 'listbox', id: 'mock-listbox' })),
    isPopupOpen: ref(false),
    selectedOption: ref(null),
    field: { value: '' },
  })),
  useOption: vi.fn(() => ({
    optionProps: computed(() => ({ role: 'option', 'aria-selected': false })),
    isSelected: ref(false),
    isDisabled: ref(false),
  })),
  useOptionGroup: vi.fn(() => ({
    groupProps: computed(() => ({ role: 'group' })),
    labelProps: computed(() => ({ id: 'mock-group-label' })),
  })),
  useComboBox: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-combobox-id',
    inputProps: computed(() => ({ id: 'mock-combobox-id', role: 'combobox' })),
    buttonProps: computed(() => ({ type: 'button', 'aria-label': 'Toggle' })),
    listBoxProps: computed(() => ({ role: 'listbox', id: 'mock-cb-listbox' })),
    isPopupOpen: ref(false),
    field: { value: '' },
  })),
  useDefaultFilter: vi.fn(() => ({
    contains: vi.fn(() => true),
    startsWith: vi.fn(() => true),
    endsWith: vi.fn(() => true),
    equals: vi.fn(() => true),
  })),
  useFileField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-file-id',
    inputProps: computed(() => ({ id: 'mock-file-id', type: 'file' })),
    triggerProps: computed(() => ({ type: 'button' })),
    dropzoneProps: computed(() => ({
      onDragenter: vi.fn(),
      onDragover: vi.fn(),
      onDragleave: vi.fn(),
      onDrop: vi.fn(),
      onClick: vi.fn(),
    })),
    entries: ref([]),
    isDragging: ref(false),
    removeButtonProps: computed(() => ({ type: 'button' })),
    isUploading: computed(() => false),
    showPicker: vi.fn(),
    clear: vi.fn(),
    remove: vi.fn(),
    field: { value: '' },
  })),
  useOtpField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-otp-id',
    controlProps: computed(() => ({ id: 'mock-otp-id' })),
    fieldSlots: ref([
      { inputProps: { id: 'slot-0' }, value: '' },
      { inputProps: { id: 'slot-1' }, value: '' },
      { inputProps: { id: 'slot-2' }, value: '' },
      { inputProps: { id: 'slot-3' }, value: '' },
      { inputProps: { id: 'slot-4' }, value: '' },
      { inputProps: { id: 'slot-5' }, value: '' },
    ]),
    field: { value: '' },
  })),
  useCustomField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-custom-id',
    field: { value: '' },
  })),
}))

import { UiComboBox, UiFileUpload, UiOTPField, UiSelect, UiTagsField } from '@/components/ui'

describe('Formwerk Selection & Compound Fields', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('UiSelect', () => {
    it('renders with label and options', () => {
      const wrapper = mount(UiSelect, {
        props: {
          label: 'Country',
          name: 'country',
          options: [
            { label: 'USA', value: 'us' },
            { label: 'Canada', value: 'ca' },
          ],
        },
      })
      expect(wrapper.text()).toContain('Country')
      expect(wrapper.find('[data-ui="select"]').exists()).toBe(true)
      expect(wrapper.find('[data-ui="select"]').classes()).toContain('min-h-11')
      expect(wrapper.find('[data-ui="select"]').classes()).not.toContain('min-w-45')
    })

    it('displays error message', () => {
      const wrapper = mount(UiSelect, {
        props: {
          label: 'Country',
          name: 'country',
          options: [{ label: 'USA', value: 'us' }],
          error: 'Required',
        },
      })
      expect(wrapper.text()).toContain('Required')
    })
  })

  describe('UiComboBox', () => {
    it('renders with label and input', () => {
      const wrapper = mount(UiComboBox, {
        props: {
          label: 'Search',
          name: 'search',
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
      })
      expect(wrapper.text()).toContain('Search')
      expect(wrapper.find('[data-ui="combobox"]').exists()).toBe(true)
    })

    it('renders options in listbox', () => {
      const wrapper = mount(UiComboBox, {
        props: {
          label: 'Search',
          name: 'search',
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
      })
      expect(wrapper.text()).toContain('Option A')
      expect(wrapper.text()).toContain('Option B')
    })
  })

  describe('UiFileUpload', () => {
    it('renders with label and drop zone', () => {
      const wrapper = mount(UiFileUpload, {
        props: {
          label: 'Upload',
          name: 'file',
        },
      })
      expect(wrapper.text()).toContain('Upload')
      expect(wrapper.find('[data-ui="file-upload"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(UiFileUpload, {
        props: {
          label: 'Upload',
          name: 'file',
          error: 'File too large',
        },
      })
      expect(wrapper.text()).toContain('File too large')
    })
  })

  describe('UiOTPField', () => {
    it('renders OTP slots', () => {
      const wrapper = mount(UiOTPField, {
        props: {
          label: 'Verification Code',
          name: 'otp',
        },
      })
      expect(wrapper.text()).toContain('Verification Code')
      const inputs = wrapper
        .findAll('input')
        .filter((input) => input.attributes('aria-label')?.startsWith('pin input '))
      expect(inputs.length).toBe(6)
    })

    it('displays error message', () => {
      const wrapper = mount(UiOTPField, {
        props: {
          label: 'Code',
          name: 'otp',
          error: 'Invalid code',
        },
      })
      expect(wrapper.text()).toContain('Invalid code')
    })
  })

  describe('UiTagsField', () => {
    it('renders with label', () => {
      const wrapper = mount(UiTagsField, {
        props: {
          label: 'Tags',
          name: 'tags',
        },
      })
      expect(wrapper.text()).toContain('Tags')
      expect(wrapper.find('[data-ui="tags-field"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(UiTagsField, {
        props: {
          label: 'Tags',
          name: 'tags',
          error: 'At least one tag required',
        },
      })
      expect(wrapper.text()).toContain('At least one tag required')
    })
  })
})
