/**
 * What every field did inside a `UiForm` at a22d396, the commit before the
 * form was reworked. MEASURED, not written: `ui-form-field-matrix.test.ts` was
 * run against a checkout of that commit with `FIELD_MATRIX_RECORD` set, and
 * this is what it recorded, with the same Formwerk the lockfile pins today.
 *
 * Rows `none`, `null`, `empty` and `value` are the contract: a field must
 * still do exactly this. Row `initial` is here for the record only (it is the
 * row the rule changes), except for a type the test marks `keptAtBase`.
 *
 * Do not edit by hand. The oddities are real and were there before: a text
 * field keeps a `null` the form holds, a radio group and a switch do not put
 * a value they were handed into their ARIA state, an OTP field wipes a bound
 * value. They are pinned so a change to any of them is a decision, not an
 * accident.
 */
export interface MeasuredCell {
  value: unknown
  shown: { text: string; inputs: string[]; state: string[] }
  dirty: boolean
  valid: boolean
  model?: unknown
}

export const MEASURED_AT_A22D396: Record<string, Record<string, MeasuredCell>> = {
  text: {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field Invalid input: expected string, received undefined',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 'from-form',
      shown: {
        text: 'Field',
        inputs: ['from-form'],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field Invalid input: expected string, received null',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Field',
        inputs: ['explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  textarea: {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field Invalid input: expected string, received undefined',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 'from-form',
      shown: {
        text: 'Field',
        inputs: ['from-form'],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field Invalid input: expected string, received null',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Field',
        inputs: ['explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  number: {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field Invalid input: expected number, received undefined',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 7,
      shown: {
        text: 'Field',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field Invalid input: expected number, received null',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: 0,
      shown: {
        text: 'Field',
        inputs: ['0', '0'],
        state: ['spinbutton aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
      model: 0,
    },
    value: {
      value: 3,
      shown: {
        text: 'Field',
        inputs: ['3', '3'],
        state: ['spinbutton aria-valuenow=3'],
      },
      dirty: false,
      valid: true,
      model: 3,
    },
  },
  select: {
    none: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'Field Gamma▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  'select-multiple': {
    none: {
      value: [],
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: [],
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: [],
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: [],
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: [],
    },
    value: {
      value: ['c'],
      shown: {
        text: 'Field Gamma▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: ['c'],
    },
  },
  combobox: {
    none: {
      value: '',
      shown: {
        text: 'Field ▼ AlphaBetaGamma /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-combobox-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-combobox-viewport]::-webkit-scrollbar { display: none; }',
        inputs: ['', ''],
        state: [
          'button data-state=closed',
          'listbox data-state=closed',
          'option data-state=unchecked',
          'option data-state=unchecked',
          'option data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field ▼ AlphaBetaGamma /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-combobox-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-combobox-viewport]::-webkit-scrollbar { display: none; }',
        inputs: ['', ''],
        state: [
          'button data-state=closed',
          'listbox data-state=closed',
          'option data-state=unchecked',
          'option data-state=unchecked',
          'option data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field ▼ AlphaBetaGamma /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-combobox-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-combobox-viewport]::-webkit-scrollbar { display: none; }',
        inputs: ['', ''],
        state: [
          'button data-state=closed',
          'listbox data-state=closed',
          'option data-state=unchecked',
          'option data-state=unchecked',
          'option data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field ▼ AlphaBetaGamma /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-combobox-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-combobox-viewport]::-webkit-scrollbar { display: none; }',
        inputs: ['', ''],
        state: [
          'button data-state=closed',
          'listbox data-state=closed',
          'option data-state=unchecked',
          'option data-state=unchecked',
          'option data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'Field ▼ AlphaBeta ✓ Gamma /* Hide scrollbars cross-browser and enable momentum scroll for touch devices */ [data-reka-combobox-viewport] { scrollbar-width:none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; } [data-reka-combobox-viewport]::-webkit-scrollbar { display: none; }',
        inputs: ['Gamma', 'c'],
        state: [
          'button data-state=closed',
          'listbox data-state=closed',
          'option data-state=unchecked',
          'option data-state=unchecked',
          'option data-state=checked',
        ],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  checkbox: {
    none: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
      model: false,
    },
    value: {
      value: true,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=true data-state=checked', 'span data-state=checked'],
      },
      dirty: false,
      valid: true,
      model: true,
    },
  },
  'radio-group': {
    none: {
      value: '<undefined>',
      shown: {
        text: 'FieldAlphaBetaGammaInvalid input: expected string, received undefined',
        inputs: [],
        state: [
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
        ],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 'b',
      shown: {
        text: 'FieldAlphaBetaGamma',
        inputs: [],
        state: [
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'FieldAlphaBetaGammaInvalid input: expected string, received null',
        inputs: [],
        state: [
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
        ],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: '',
      shown: {
        text: 'FieldAlphaBetaGamma',
        inputs: [],
        state: [
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'FieldAlphaBetaGamma',
        inputs: [],
        state: [
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
          'radio aria-checked=false data-state=unchecked',
        ],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  switch: {
    none: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
      model: false,
    },
    value: {
      value: true,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill on',
        ],
      },
      dirty: false,
      valid: true,
      model: true,
    },
  },
  toggle: {
    none: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false aria-pressed=false data-state=off', 'fill off'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false aria-pressed=false data-state=off', 'fill off'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false aria-pressed=false data-state=off', 'fill off'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false aria-pressed=false data-state=off', 'fill off'],
      },
      dirty: false,
      valid: true,
      model: false,
    },
    value: {
      value: true,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=true aria-pressed=false data-state=off', 'fill on'],
      },
      dirty: false,
      valid: true,
      model: true,
    },
  },
  slider: {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field 50Invalid input: expected number, received undefined',
        inputs: ['50'],
        state: ['slider aria-valuenow=50'],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 30,
      shown: {
        text: 'Field 30',
        inputs: ['30'],
        state: ['slider aria-valuenow=30'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field 50Invalid input: expected number, received null',
        inputs: ['50'],
        state: ['slider aria-valuenow=50'],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: 0,
      shown: {
        text: 'Field 0',
        inputs: ['0'],
        state: ['slider aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
      model: 0,
    },
    value: {
      value: 80,
      shown: {
        text: 'Field 80',
        inputs: ['80'],
        state: ['slider aria-valuenow=80'],
      },
      dirty: false,
      valid: true,
      model: 80,
    },
  },
  date: {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field mm/dd/yyyyInvalid input: expected date, received undefined',
        inputs: [''],
        state: [
          'spinbutton aria-valuenow=10',
          'spinbutton aria-valuenow=8',
          'spinbutton aria-valuenow=2026',
        ],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: '<Date 2024-01-14T23:00:00.000Z>',
      shown: {
        text: 'Field 1/15/2024',
        inputs: ['2024-01-15'],
        state: [
          'spinbutton aria-valuenow=1',
          'spinbutton aria-valuenow=15',
          'spinbutton aria-valuenow=2024',
        ],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field mm/dd/yyyyInvalid input: expected date, received null',
        inputs: [''],
        state: [
          'spinbutton aria-valuenow=10',
          'spinbutton aria-valuenow=8',
          'spinbutton aria-valuenow=2026',
        ],
      },
      dirty: false,
      valid: false,
    },
    value: {
      value: '<Date 2025-06-19T23:00:00.000Z>',
      shown: {
        text: 'Field 6/20/2025',
        inputs: ['2025-06-20'],
        state: [
          'spinbutton aria-valuenow=6',
          'spinbutton aria-valuenow=20',
          'spinbutton aria-valuenow=2025',
        ],
      },
      dirty: false,
      valid: true,
      model: '<Date 2025-06-19T23:00:00.000Z>',
    },
  },
  otp: {
    none: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['', '', '', '', '', '', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['', '', '', '', '', '', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['', '', '', '', '', '', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['', '', '', '', '', '', ''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['', '', '', '', '', '', ''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
  },
  tags: {
    none: {
      value: [],
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: [],
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: [],
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: [],
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: [],
    },
    value: {
      value: ['y'],
      shown: {
        text: 'Field y ✕',
        inputs: ['', 'y'],
        state: ['div data-state=inactive', 'button data-state=inactive'],
      },
      dirty: false,
      valid: true,
      model: ['y'],
    },
  },
  rating: {
    none: {
      value: 0,
      shown: {
        text: 'Field ★ ★ ★ ★ ★',
        inputs: [],
        state: ['star unlit', 'star unlit', 'star unlit', 'star unlit', 'star unlit'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: 0,
      shown: {
        text: 'Field ★ ★ ★ ★ ★',
        inputs: [],
        state: ['star unlit', 'star unlit', 'star unlit', 'star unlit', 'star unlit'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: 0,
      shown: {
        text: 'Field ★ ★ ★ ★ ★',
        inputs: [],
        state: ['star unlit', 'star unlit', 'star unlit', 'star unlit', 'star unlit'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: 0,
      shown: {
        text: 'Field ★ ★ ★ ★ ★',
        inputs: [],
        state: ['star unlit', 'star unlit', 'star unlit', 'star unlit', 'star unlit'],
      },
      dirty: false,
      valid: true,
      model: 0,
    },
    value: {
      value: 2,
      shown: {
        text: 'Field ★ ★ ★ ★ ★',
        inputs: [],
        state: ['star lit', 'star lit', 'star unlit', 'star unlit', 'star unlit'],
      },
      dirty: false,
      valid: true,
      model: 2,
    },
  },
  'color-picker': {
    none: {
      value: '#000000',
      shown: {
        text: 'Field',
        inputs: ['#000000', '#000000'],
        state: ['slider aria-valuenow=0', 'slider aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '#000000',
      shown: {
        text: 'Field',
        inputs: ['#000000', '#000000'],
        state: ['slider aria-valuenow=0', 'slider aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '#000000',
      shown: {
        text: 'Field',
        inputs: ['#000000', '#000000'],
        state: ['slider aria-valuenow=0', 'slider aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: ['#000000', '#000000'],
        state: ['slider aria-valuenow=0', 'slider aria-valuenow=0'],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: '#00ff00',
      shown: {
        text: 'Field',
        inputs: ['#00ff00', '#00ff00'],
        state: ['slider aria-valuenow=100', 'slider aria-valuenow=120'],
      },
      dirty: false,
      valid: true,
      model: '#00ff00',
    },
  },
  'tree-select': {
    none: {
      value: '',
      shown: {
        text: 'Field Select...▼',
        inputs: [],
        state: ['button data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field Select...▼',
        inputs: [],
        state: ['button data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field Select...▼',
        inputs: [],
        state: ['button data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field Select...▼',
        inputs: [],
        state: ['button data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'Field Gamma▼',
        inputs: [],
        state: ['button data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  mentions: {
    none: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Field',
        inputs: ['explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  editable: {
    none: {
      value: '',
      shown: {
        text: 'FieldClick to edit',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'FieldClick to edit',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'FieldClick to edit',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'FieldClick to edit',
        inputs: ['', ''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Fieldexplicit',
        inputs: ['explicit', 'explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  'group/text': {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field Invalid input: expected string, received undefined',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 'from-form',
      shown: {
        text: 'Field',
        inputs: ['from-form'],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field Invalid input: expected string, received null',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Field',
        inputs: ['explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  'group/select': {
    none: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'Field Gamma▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  'group/switch': {
    none: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: false,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill off',
        ],
      },
      dirty: false,
      valid: true,
      model: false,
    },
    value: {
      value: true,
      shown: {
        text: 'Field',
        inputs: ['on'],
        state: [
          'switch aria-checked=false data-state=unchecked',
          'span data-state=unchecked',
          'fill on',
        ],
      },
      dirty: false,
      valid: true,
      model: true,
    },
  },
  'repeater/text': {
    none: {
      value: '<undefined>',
      shown: {
        text: 'Field Invalid input: expected string, received undefined',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    initial: {
      value: 'from-form',
      shown: {
        text: 'Field',
        inputs: ['from-form'],
        state: [],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: null,
      shown: {
        text: 'Field Invalid input: expected string, received null',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: false,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field',
        inputs: [''],
        state: [],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'explicit',
      shown: {
        text: 'Field',
        inputs: ['explicit'],
        state: [],
      },
      dirty: false,
      valid: true,
      model: 'explicit',
    },
  },
  'repeater/select': {
    none: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: '',
      shown: {
        text: 'Field Select...▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: '',
    },
    value: {
      value: 'c',
      shown: {
        text: 'Field Gamma▼AlphaBetaGamma',
        inputs: [],
        state: ['combobox data-state=closed'],
      },
      dirty: false,
      valid: true,
      model: 'c',
    },
  },
  'repeater/checkbox': {
    none: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    initial: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    null: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
    },
    empty: {
      value: false,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=false data-state=unchecked'],
      },
      dirty: false,
      valid: true,
      model: false,
    },
    value: {
      value: true,
      shown: {
        text: 'Field',
        inputs: [],
        state: ['checkbox aria-checked=true data-state=checked', 'span data-state=checked'],
      },
      dirty: false,
      valid: true,
      model: true,
    },
  },
}
