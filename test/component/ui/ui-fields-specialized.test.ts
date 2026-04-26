import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { ref, computed, defineComponent } from 'vue'

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
  useSlider: vi.fn(() => ({
    ...createMockFieldReturn(),
    groupProps: computed(() => ({ role: 'group', id: 'mock-slider-group' })),
    trackProps: computed(() => ({ role: 'presentation', id: 'mock-track' })),
    trackEl: ref(null),
    outputProps: computed(() => ({ 'aria-live': 'polite' })),
    useThumbMetadata: vi.fn(() => ({})),
    field: { value: 50 },
  })),
  useSliderThumb: vi.fn(() => ({
    thumbProps: computed(() => ({
      role: 'slider',
      tabindex: '0',
      'aria-valuenow': 50,
    })),
    currentValue: ref(50),
    currentText: ref('50'),
    isDragging: ref(false),
  })),
  useCustomField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlProps: computed(() => ({ id: 'mock-custom-id', role: 'textbox' })),
    field: { value: '' },
  })),
  useStepFormFlow: vi.fn(() => ({
    steps: ref([]),
    currentStep: ref(null),
    currentIndex: ref(0),
    isLastStep: ref(false),
    formProps: computed(() => ({ id: 'mock-form', role: 'form' })),
    nextButtonProps: computed(() => ({
      type: 'button' as const,
      disabled: false,
    })),
    previousButtonProps: computed(() => ({
      type: 'button' as const,
      disabled: true,
    })),
    next: vi.fn(),
    previous: vi.fn(),
    onDone: vi.fn(),
    FormStep: defineComponent({
      name: 'FormStep',
      template: '<div data-ui="form-step"><slot /></div>',
    }),
    isCurrentStep: vi.fn().mockReturnValue(true),
    getStepValue: vi.fn(),
    onBeforeStepResolve: vi.fn(),
    values: ref({}),
    context: {},
  })),
  useFormStep: vi.fn(),
}))

import RekaColorPicker from '@/components/ui/provider/reka/RekaColorPicker.vue'
import RekaEditable from '@/components/ui/provider/reka/RekaEditable.vue'
import RekaMentionsField from '@/components/ui/provider/reka/RekaMentionsField.vue'
import RekaRatingField from '@/components/ui/provider/reka/RekaRatingField.vue'
import RekaSlider from '@/components/ui/provider/reka/RekaSlider.vue'

describe('Formwerk Specialized Fields', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('RekaSlider', () => {
    it('renders with label and track', () => {
      const wrapper = mount(RekaSlider, {
        props: {
          label: 'Volume',
          name: 'volume',
        },
      })
      expect(wrapper.text()).toContain('Volume')
      expect(wrapper.find('[data-ui="slider"]').exists()).toBe(true)
    })

    it('renders output element', () => {
      const wrapper = mount(RekaSlider, {
        props: {
          label: 'Volume',
          name: 'volume',
        },
      })
      const output = wrapper.find('output')
      expect(output.exists()).toBe(true)
      expect(output.text()).toContain('50')
    })

    it('displays error message', () => {
      const wrapper = mount(RekaSlider, {
        props: {
          label: 'Volume',
          name: 'volume',
          error: 'Value out of range',
        },
      })
      expect(wrapper.text()).toContain('Value out of range')
    })
  })

  describe('RekaColorPicker', () => {
    it('renders with label', () => {
      const wrapper = mount(RekaColorPicker, {
        props: {
          label: 'Theme Color',
          name: 'color',
        },
      })
      expect(wrapper.text()).toContain('Theme Color')
      expect(wrapper.find('[data-ui="color-picker"]').exists()).toBe(true)
    })

    it('renders color input', () => {
      const wrapper = mount(RekaColorPicker, {
        props: {
          label: 'Color',
          name: 'color',
        },
      })
      expect(wrapper.find('input[type="color"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(RekaColorPicker, {
        props: {
          label: 'Color',
          name: 'color',
          error: 'Invalid color',
        },
      })
      expect(wrapper.text()).toContain('Invalid color')
    })
  })

  describe('RekaEditable', () => {
    it('renders with label', () => {
      const wrapper = mount(RekaEditable, {
        props: {
          label: 'Title',
          name: 'title',
        },
      })
      expect(wrapper.text()).toContain('Title')
      expect(wrapper.find('[data-ui="editable"]').exists()).toBe(true)
    })

    it('shows edit button', () => {
      const wrapper = mount(RekaEditable, {
        props: {
          label: 'Title',
          name: 'title',
        },
      })
      expect(wrapper.find('[data-ui="editable"]').exists()).toBe(true)
      expect(wrapper.find('span').exists()).toBe(true)
    })
  })

  describe('RekaMentionsField', () => {
    it('renders with label', () => {
      const wrapper = mount(RekaMentionsField, {
        props: {
          label: 'Comment',
          name: 'comment',
        },
      })
      expect(wrapper.text()).toContain('Comment')
      expect(wrapper.find('[data-ui="mentions-field"]').exists()).toBe(true)
    })

    it('renders textarea', () => {
      const wrapper = mount(RekaMentionsField, {
        props: {
          label: 'Comment',
          name: 'comment',
        },
      })
      expect(wrapper.find('textarea').exists()).toBe(true)
    })
  })

  describe('RekaRatingField', () => {
    it('renders with label', () => {
      const wrapper = mount(RekaRatingField, {
        props: {
          label: 'Rating',
          name: 'rating',
        },
      })
      expect(wrapper.text()).toContain('Rating')
      expect(wrapper.find('[data-ui="rating"]').exists()).toBe(true)
    })

    it('renders star buttons', () => {
      const wrapper = mount(RekaRatingField, {
        props: {
          label: 'Rating',
          name: 'rating',
          maxStars: 5,
        },
      })
      const stars = wrapper.findAll('[data-ui="rating"] button')
      expect(stars.length).toBe(5)
    })

    it('displays error message', () => {
      const wrapper = mount(RekaRatingField, {
        props: {
          label: 'Rating',
          name: 'rating',
          error: 'Please rate',
        },
      })
      expect(wrapper.text()).toContain('Please rate')
    })
  })
})
