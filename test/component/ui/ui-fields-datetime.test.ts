import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { ref, computed } from 'vue'

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

const mockSegments = ref([
  { type: 'month', text: 'Jan', props: { id: 'seg-0' } },
  { type: 'literal', text: '/', props: { id: 'seg-1' } },
  { type: 'day', text: '01', props: { id: 'seg-2' } },
  { type: 'literal', text: '/', props: { id: 'seg-3' } },
  { type: 'year', text: '2025', props: { id: 'seg-4' } },
])

const mockTimeSegments = ref([
  { type: 'hour', text: '12', props: { id: 'tseg-0' } },
  { type: 'literal', text: ':', props: { id: 'tseg-1' } },
  { type: 'minute', text: '00', props: { id: 'tseg-2' } },
])

vi.mock('@formwerk/core', () => ({
  useDateField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-date-id',
    controlProps: computed(() => ({ id: 'mock-date-id', role: 'group' })),
    segments: mockSegments,
    direction: ref('ltr'),
    calendarProps: computed(() => ({ label: 'Calendar' })),
    field: { value: undefined },
  })),
  useTimeField: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-time-id',
    controlProps: computed(() => ({ id: 'mock-time-id', role: 'group' })),
    segments: mockTimeSegments,
    direction: ref('ltr'),
    field: { value: '' },
  })),
  useCalendar: vi.fn(() => ({
    ...createMockFieldReturn(),
    controlId: 'mock-calendar-id',
    calendarProps: computed(() => ({
      role: 'application',
      dir: 'ltr',
      onKeydown: vi.fn(),
      id: 'mock-cal',
    })),
    gridProps: computed(() => ({ role: 'grid', id: 'mock-grid' })),
    selectedDate: computed(() => ({})),
    focusedDate: ref({}),
    currentView: computed(() => ({
      type: 'weeks' as const,
      days: [
        {
          type: 'day',
          dayOfMonth: 1,
          label: '1',
          isToday: false,
          isOutsideMonth: false,
          selected: false,
          disabled: false,
          focused: false,
          value: {},
        },
        {
          type: 'day',
          dayOfMonth: 2,
          label: '2',
          isToday: true,
          isOutsideMonth: false,
          selected: false,
          disabled: false,
          focused: false,
          value: {},
        },
      ],
      weekDays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    })),
    setView: vi.fn(),
    gridLabelProps: computed(() => ({
      'aria-live': 'polite' as const,
      tabindex: '0',
      onClick: vi.fn(),
      id: 'mock-label',
    })),
    gridLabel: computed(() => 'January 2025'),
    nextButtonProps: computed(() => ({ type: 'button', tabindex: '0' })),
    previousButtonProps: computed(() => ({ type: 'button', tabindex: '0' })),
    field: { value: undefined },
  })),
  usePicker: vi.fn(() => ({
    isOpen: ref(false),
    pickerProps: computed(() => ({
      role: 'dialog',
      'aria-modal': 'true' as const,
      'aria-label': 'Picker',
    })),
    pickerTriggerProps: computed(() => ({
      type: 'button' as const,
      role: 'button',
      tabindex: '0',
    })),
    pickerEl: ref(null),
  })),
  DateTimeSegment: {
    name: 'DateTimeSegment',
    props: ['type', 'text', 'props'],
    template: '<span>{{ text }}</span>',
  },
}))

import {
  UiCalendar,
  UiDateField,
  UiDatePicker,
  UiMonthPicker,
  UiTimeField,
  UiYearPicker,
} from '@/components/ui'

describe('Formwerk Date, Time & Calendar Fields', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('UiDateField', () => {
    it('renders with label and segments', () => {
      const wrapper = mount(UiDateField, {
        props: {
          label: 'Birthday',
          name: 'birthday',
        },
      })
      expect(wrapper.text()).toContain('Birthday')
      expect(wrapper.find('[data-ui="date-field"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(UiDateField, {
        props: {
          label: 'Birthday',
          name: 'birthday',
          error: 'Invalid date',
        },
      })
      expect(wrapper.text()).toContain('Invalid date')
    })

    it('shows hint text', () => {
      const wrapper = mount(UiDateField, {
        props: {
          label: 'Birthday',
          name: 'birthday',
          hint: 'MM/DD/YYYY',
        },
      })
      expect(wrapper.text()).toContain('MM/DD/YYYY')
    })
  })

  describe('UiTimeField', () => {
    it('renders with label and segments', () => {
      const wrapper = mount(UiTimeField, {
        props: {
          label: 'Start Time',
          name: 'startTime',
        },
      })
      expect(wrapper.text()).toContain('Start Time')
      expect(wrapper.find('[data-ui="time-field"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(UiTimeField, {
        props: {
          label: 'Time',
          name: 'time',
          error: 'Required',
        },
      })
      expect(wrapper.text()).toContain('Required')
    })
  })

  describe('UiCalendar', () => {
    it('renders calendar with grid label', () => {
      const wrapper = mount(UiCalendar, {
        props: {
          label: 'Date',
        },
      })
      expect(wrapper.find('[data-ui="calendar"]').exists()).toBe(true)
      expect(wrapper.text()).toMatch(
        /January|February|March|April|May|June|July|August|September|October|November|December/,
      )
    })

    it('renders week day headers', () => {
      const wrapper = mount(UiCalendar, {
        props: {
          label: 'Date',
        },
      })
      expect(wrapper.text()).toContain('S')
      expect(wrapper.text()).toContain('M')
      expect(wrapper.text()).toContain('T')
      expect(wrapper.text()).toContain('W')
      expect(wrapper.text()).toContain('F')
    })

    it('renders day cells', () => {
      const wrapper = mount(UiCalendar, {
        props: {
          label: 'Date',
        },
      })
      expect(wrapper.text()).toContain('1')
      expect(wrapper.text()).toContain('2')
    })

    it('renders navigation buttons', () => {
      const wrapper = mount(UiCalendar, {
        props: {
          label: 'Date',
        },
      })
      expect(wrapper.text()).toContain('←')
      expect(wrapper.text()).toContain('→')
    })
  })

  describe('UiDatePicker', () => {
    it('renders with label and trigger button', () => {
      const wrapper = mount(UiDatePicker, {
        props: {
          label: 'Due Date',
          name: 'dueDate',
        },
      })
      expect(wrapper.text()).toContain('Due Date')
      expect(wrapper.find('[data-ui="date-picker"]').exists()).toBe(true)
    })

    it('displays error message', () => {
      const wrapper = mount(UiDatePicker, {
        props: {
          label: 'Due Date',
          name: 'dueDate',
          error: 'Past dates not allowed',
        },
      })
      expect(wrapper.text()).toContain('Past dates not allowed')
    })
  })

  describe('UiMonthPicker', () => {
    it('renders with label', () => {
      const wrapper = mount(UiMonthPicker, {
        props: {
          label: 'Billing Month',
          name: 'billingMonth',
        },
      })
      expect(wrapper.text()).toContain('Billing Month')
      expect(wrapper.find('[data-ui="month-picker"]').exists()).toBe(true)
    })
  })

  describe('UiYearPicker', () => {
    it('renders with label', () => {
      const wrapper = mount(UiYearPicker, {
        props: {
          label: 'Billing Year',
          name: 'billingYear',
        },
      })
      expect(wrapper.text()).toContain('Billing Year')
      expect(wrapper.find('[data-ui="year-picker"]').exists()).toBe(true)
    })
  })
})
