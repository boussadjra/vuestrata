<script setup lang="ts">
import { Comark } from 'comark/vue'

import ChartsDemo from '@/components/docs/demos/ChartsDemo.vue'
import chartsSource from '@/components/docs/demos/ChartsDemo.vue?raw'
import ChoiceInputsDemo from '@/components/docs/demos/ChoiceInputsDemo.vue'
import choiceInputsSource from '@/components/docs/demos/ChoiceInputsDemo.vue?raw'
import DataTableDemo from '@/components/docs/demos/DataTableDemo.vue'
import dataTableSource from '@/components/docs/demos/DataTableDemo.vue?raw'
import DateTimeDemo from '@/components/docs/demos/DateTimeDemo.vue'
import dateTimeSource from '@/components/docs/demos/DateTimeDemo.vue?raw'
import FormBuilderDemo from '@/components/docs/demos/FormBuilderDemo.vue'
import formBuilderSource from '@/components/docs/demos/FormBuilderDemo.vue?raw'
import FormsDemo from '@/components/docs/demos/FormsDemo.vue'
import formsSource from '@/components/docs/demos/FormsDemo.vue?raw'
import OverviewDemo from '@/components/docs/demos/OverviewDemo.vue'
import overviewSource from '@/components/docs/demos/OverviewDemo.vue?raw'
import SelectionInputsDemo from '@/components/docs/demos/SelectionInputsDemo.vue'
import selectionInputsSource from '@/components/docs/demos/SelectionInputsDemo.vue?raw'
import SpecializedDemo from '@/components/docs/demos/SpecializedDemo.vue'
import specializedSource from '@/components/docs/demos/SpecializedDemo.vue?raw'
import TextInputsDemo from '@/components/docs/demos/TextInputsDemo.vue'
import textInputsSource from '@/components/docs/demos/TextInputsDemo.vue?raw'
import { UiToggleGroup } from '@/components/ui'
import { docsComarkPlugins } from '@/config/comark'

const props = defineProps<{
  name:
    | 'overview'
    | 'forms'
    | 'data-table'
    | 'charts'
    | 'text-inputs'
    | 'choice-inputs'
    | 'selection-inputs'
    | 'date-time'
    | 'specialized'
    | 'form-builder'
}>()

const demos = {
  overview: {
    title: 'Component API example',
    description: 'Switch between a live preview and the underlying implementation.',
    component: OverviewDemo,
    source: overviewSource,
  },
  forms: {
    title: 'Form components',
    description: 'Interactive form controls using the shared adapter API.',
    component: FormsDemo,
    source: formsSource,
  },
  'data-table': {
    title: 'Data table composition',
    description: 'A small table wired to the same composable used in the app.',
    component: DataTableDemo,
    source: dataTableSource,
  },
  charts: {
    title: 'Chart wrapper',
    description: 'Theme-aware chart rendering with a concise `BaseChart` API.',
    component: ChartsDemo,
    source: chartsSource,
  },
  'text-inputs': {
    title: 'Text input fields',
    description: 'TextField, SearchField, NumberField, and Textarea with live value binding.',
    component: TextInputsDemo,
    source: textInputsSource,
  },
  'choice-inputs': {
    title: 'Choice input fields',
    description: 'Checkbox, Switch, Toggle, RadioGroup, and ToggleGroup in action.',
    component: ChoiceInputsDemo,
    source: choiceInputsSource,
  },
  'selection-inputs': {
    title: 'Selection input fields',
    description: 'Select, ComboBox, TagsField, TreeSelect, and OTPField demos.',
    component: SelectionInputsDemo,
    source: selectionInputsSource,
  },
  'date-time': {
    title: 'Date & time fields',
    description: 'DateField, TimeField, DatePicker, MonthPicker, and YearPicker.',
    component: DateTimeDemo,
    source: dateTimeSource,
  },
  specialized: {
    title: 'Specialized fields',
    description: 'Slider, ColorPicker, Editable, and RatingField demos.',
    component: SpecializedDemo,
    source: specializedSource,
  },
  'form-builder': {
    title: 'Config-driven form builder',
    description: 'Generate forms from data using useFormBuilder() and UiFormBuilder.',
    component: FormBuilderDemo,
    source: formBuilderSource,
  },
} as const

const demo = computed(() => demos[props.name])
const codeMarkdown = computed(() => `\`\`\`vue\n${demo.value.source.trim()}\n\`\`\``)
const activePanel = ref<'preview' | 'code'>('preview')
</script>

<template>
  <section
    class="docs-showcase border-surface-200 dark:border-surface-700 dark:bg-surface-900 shadow-soft my-8 overflow-hidden rounded-[1.75rem] border bg-white"
  >
    <div class="border-surface-200 dark:border-surface-700 border-b px-5 py-4 lg:px-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p
            class="text-primary-600 dark:text-primary-300 text-xs font-semibold tracking-[0.22em] uppercase"
          >
            Component Demo
          </p>
          <h3 class="text-surface-900 mt-1 text-xl font-bold dark:text-white">{{ demo.title }}</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">{{ demo.description }}</p>
        </div>

        <UiToggleGroup
          :model-value="activePanel"
          :options="[
            { label: 'Preview', value: 'preview' },
            { label: 'Code', value: 'code' },
          ]"
          size="md"
          @update:model-value="(value) => (activePanel = value as 'preview' | 'code')"
        />
      </div>
    </div>

    <div
      v-if="activePanel === 'preview'"
      class="from-surface-50 to-primary-50/40 dark:from-surface-900 dark:via-surface-900 dark:to-primary-950/25 bg-linear-to-br via-white p-5 lg:p-6"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h4
          class="text-surface-500 dark:text-surface-400 text-sm font-semibold tracking-[0.18em] uppercase"
        >
          Preview
        </h4>
        <span
          class="border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300 rounded-full border px-3 py-1 text-xs font-semibold"
          >Live</span
        >
      </div>
      <div
        class="border-surface-200/80 shadow-soft dark:border-surface-700 dark:bg-surface-900/80 rounded-[1.25rem] border bg-white/85 p-4 lg:p-5"
      >
        <component :is="demo.component" />
      </div>
    </div>

    <div v-else class="bg-surface-50 dark:bg-surface-950 p-5 lg:p-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h4
          class="text-surface-500 dark:text-surface-400 text-sm font-semibold tracking-[0.18em] uppercase"
        >
          Code
        </h4>
        <span
          class="border-surface-200 text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400 rounded-full border bg-white px-3 py-1 text-xs font-medium"
          >Vue SFC</span
        >
      </div>
      <Comark :markdown="codeMarkdown" :plugins="docsComarkPlugins" />
    </div>
  </section>
</template>
