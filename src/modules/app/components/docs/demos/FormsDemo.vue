<script setup lang="ts">
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { z } from 'zod'

import { resolveIcon } from '~/config/icon-provider'

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' },
  { label: 'Viewer', value: 'viewer' },
]

const validatorLabel = 'Zod'

function buildMemberSchema(): StandardSchemaV1 {
  return z.object({
    name: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.string().email('Work email must be valid'),
    role: z.enum(['admin', 'member', 'viewer']),
    notes: z.string().max(280, 'Notes must be 280 characters or less').optional(),
    agreed: z.literal(true, {
      message: 'You must enable onboarding email to continue',
    }),
  }) as unknown as StandardSchemaV1
}

const schemaSnippet = `const memberSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().email('Work email must be valid'),
  role: z.enum(['admin', 'member', 'viewer']),
  notes: z.string().max(280, 'Notes must be 280 characters or less').optional(),
  agreed: z.literal(true, { message: 'You must enable onboarding email to continue' }),
})`

const memberSchema = computed<StandardSchemaV1>(() => buildMemberSchema())

const openScenarioCode = ref<Record<string, boolean>>({})

type DemoScenarioSeed = {
  key: string
  eyebrow: string
  title: string
  description: string
  fallbackSummary: string
  footnote: string
  submitLabel: string
  initialValues: Record<string, unknown>
}

type DemoScenario = DemoScenarioSeed & {
  lastSubmission: Ref<Record<string, unknown> | null>
  onSubmit: (values: Record<string, unknown>) => void
}

const demoScenarios: DemoScenario[] = [
  {
    key: 'baseline',
    eyebrow: 'Baseline',
    title: 'Healthy default',
    description: 'One quiet, valid draft for the happy path and default field wiring.',
    fallbackSummary: 'Use this state to inspect the no-friction path before any edits.',
    footnote: 'Start here to confirm the form shell, defaults, and adapter output all align.',
    submitLabel: 'Save draft',
    initialValues: {
      name: 'Ava Stone',
      email: 'ava.stone@team.dev',
      role: 'member',
      notes: 'Prefers short release notes and async handoffs.',
      agreed: true,
    },
  },
  {
    key: 'validation',
    eyebrow: 'Validation',
    title: 'Inline correction',
    description:
      'Broken input and unchecked consent keep the error states visible without browser prompts.',
    fallbackSummary: 'Resolve the inline errors before moving the draft forward.',
    footnote: 'This is the pressure test for invalid text, invalid email, and blocking consent.',
    submitLabel: 'Fix issues',
    initialValues: {
      name: '',
      email: 'invalid-address',
      role: 'admin',
      notes: 'Waiting for the final release notes.',
      agreed: false,
    },
  },
  {
    key: 'payload',
    eyebrow: 'Submit',
    title: 'Payload check',
    description:
      'A second complete draft reserved for submit behavior and emitted object inspection.',
    fallbackSummary: 'Submit this draft to inspect the serialized payload emitted by UiForm.',
    footnote: 'Review once, then inspect the payload panel to verify the emitted contract.',
    submitLabel: 'Submit profile',
    initialValues: {
      name: 'Mina Park',
      email: 'mina.park@client.dev',
      role: 'viewer',
      notes: 'Needs a clean handoff packet and weekly digest.',
      agreed: true,
    },
  },
].map((scenario) => {
  const lastSubmission = ref<Record<string, unknown> | null>(null)

  return {
    ...scenario,
    lastSubmission,
    onSubmit(values) {
      lastSubmission.value = values
    },
  }
})

function buildSchemaCodeSnippet() {
  return schemaSnippet
}

function buildScenarioCode(scenario: DemoScenario) {
  const initialValues = JSON.stringify(scenario.initialValues, null, 2)

  return `${buildSchemaCodeSnippet()}

<UiForm
  :schema="memberSchema"
  :initial-values='${initialValues}'
  @submit="onSubmit"
>
  <template #default="{ values, isSubmitting, isDirty, isTouched, isValid, wasSubmitted }">
    <UiTextField name="name" label="Full name" required />
    <UiTextField name="email" label="Work email" type="email" required />
    <UiSelect name="role" label="Role" :options="roleOptions" required />
    <UiTextarea name="notes" label="Notes" :rows="4" />
    <UiCheckbox name="agreed" label="Enable onboarding email automatically" />
    <UiButton type="submit" variant="primary" :disabled="isSubmitting">
      {{ isSubmitting ? 'Saving...' : isDirty ? '${scenario.submitLabel}' : 'Review draft' }}
      <span class="sr-only"> for ${scenario.title}</span>
    </UiButton>
  </template>
</UiForm>`
}

function syncScenarioCodeState(key: string, event: Event) {
  openScenarioCode.value[key] = (event.currentTarget as HTMLDetailsElement).open
}
</script>

<template>
  <div class="space-y-6">
    <section class="px-1 pt-1 pb-1 lg:px-2 lg:pt-2 lg:pb-0">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl space-y-3">
          <p
            class="text-primary-600 dark:text-primary-300 text-xs font-semibold tracking-[0.22em] uppercase"
          >
            Curated form comparison
          </p>
          <h3 class="text-surface-900 text-2xl font-bold dark:text-white">
            Three live states, one shared form shell
          </h3>
          <p class="text-muted-foreground text-sm leading-6">
            The old profile-by-surface matrix is reduced to the cases developers actually inspect: a
            healthy default, a validation-heavy draft, and a submit path with payload visibility.
          </p>
        </div>

        <div class="flex flex-wrap gap-2 text-xs font-semibold">
          <span
            class="border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300 rounded-full border px-3 py-1"
          >
            Validator: {{ validatorLabel }}
          </span>
          <span
            class="border-surface-200/80 bg-surface-100/80 text-surface-500 dark:border-surface-700 dark:bg-surface-950/75 dark:text-surface-400 rounded-full border px-3 py-1"
          >
            {{ demoScenarios.length }} live cases
          </span>
          <span
            class="border-surface-200/80 bg-surface-100/80 text-surface-500 dark:border-surface-700 dark:bg-surface-950/75 dark:text-surface-400 rounded-full border px-3 py-1"
          >
            novalidate enforced
          </span>
        </div>
      </div>
    </section>

    <div
      class="border-surface-200/80 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-900/90 overflow-hidden rounded-3xl border"
    >
      <div
        class="divide-surface-200 dark:divide-surface-700 grid divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0"
      >
        <section v-for="scenario in demoScenarios" :key="scenario.key" class="p-5 lg:p-6">
          <div class="space-y-2">
            <p
              :class="[
                'text-xs font-semibold tracking-[0.22em] uppercase',
                scenario.key === 'validation'
                  ? 'text-danger-600 dark:text-danger-300'
                  : 'text-muted-foreground',
              ]"
            >
              {{ scenario.eyebrow }}
            </p>
            <h4 class="text-surface-900 text-lg font-bold dark:text-white">
              {{ scenario.title }}
            </h4>
            <p class="text-muted-foreground text-sm leading-6">
              {{ scenario.description }}
            </p>
          </div>

          <UiForm
            :key="scenario.key"
            :schema="memberSchema"
            :initial-values="scenario.initialValues"
            @submit="scenario.onSubmit"
            novalidate
          >
            <template
              #default="{ values, isSubmitting, isDirty, isTouched, isValid, wasSubmitted }"
            >
              <div class="mt-5 space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UiTextField
                    name="name"
                    label="Full name"
                    placeholder="Enter full name"
                    required
                  />
                  <UiTextField
                    name="email"
                    label="Work email"
                    type="email"
                    placeholder="name@company.dev"
                    required
                  />
                </div>

                <UiSelect name="role" label="Role" :options="roleOptions" required />

                <UiTextarea
                  name="notes"
                  label="Notes"
                  :rows="4"
                  placeholder="Add release context, handoff notes, or approval comments"
                />

                <UiCheckbox name="agreed" label="Enable onboarding email automatically" />
              </div>

              <div class="mt-5 border-t border-current/10 pt-4">
                <p class="text-surface-900 text-sm font-medium dark:text-white">
                  {{
                    values.name && values.email
                      ? `${values.name} (${values.email}) · ${values.role}`
                      : scenario.fallbackSummary
                  }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  <span
                    class="border-surface-200/80 bg-surface-100/80 text-surface-600 dark:border-surface-800 dark:bg-surface-950/70 dark:text-surface-300 rounded-full border px-3 py-1.5"
                  >
                    Dirty: {{ isDirty ? 'yes' : 'no' }}
                  </span>
                  <span
                    class="border-surface-200/80 bg-surface-100/80 text-surface-600 dark:border-surface-800 dark:bg-surface-950/70 dark:text-surface-300 rounded-full border px-3 py-1.5"
                  >
                    Touched: {{ isTouched ? 'yes' : 'no' }}
                  </span>
                  <span
                    class="border-surface-200/80 bg-surface-100/80 text-surface-600 dark:border-surface-800 dark:bg-surface-950/70 dark:text-surface-300 rounded-full border px-3 py-1.5"
                  >
                    Valid: {{ isValid ? 'yes' : 'no' }}
                  </span>
                  <span
                    class="border-surface-200/80 bg-surface-100/80 text-surface-600 dark:border-surface-800 dark:bg-surface-950/70 dark:text-surface-300 rounded-full border px-3 py-1.5"
                  >
                    Submitted: {{ wasSubmitted ? 'yes' : 'no' }}
                  </span>
                </div>
              </div>

              <div v-if="scenario.lastSubmission.value" class="mt-4">
                <p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
                  Last payload
                </p>
                <pre
                  class="border-surface-200/70 text-surface-700 bg-surface-100/70 dark:border-surface-800 dark:bg-surface-950/75 dark:text-surface-300 mt-3 max-h-52 overflow-auto rounded-2xl border p-3 font-mono text-[11px] leading-5"
                  >{{ JSON.stringify(scenario.lastSubmission.value, null, 2) }}</pre
                >
              </div>

              <div class="mt-5 flex flex-col gap-3 border-t border-current/10 pt-4">
                <p class="text-muted-foreground text-sm leading-6">
                  {{ scenario.footnote }}
                </p>
                <UiButton
                  class="sm:self-start"
                  type="submit"
                  variant="primary"
                  :disabled="isSubmitting"
                >
                  {{ isSubmitting ? 'Saving...' : isDirty ? scenario.submitLabel : 'Review draft' }}
                  <span class="sr-only"> for {{ scenario.title }}</span>
                </UiButton>
              </div>
            </template>
          </UiForm>

          <details
            class="group mt-4 border-t border-current/10 pt-4"
            @toggle="syncScenarioCodeState(scenario.key, $event)"
          >
            <summary
              class="border-surface-200/70 text-surface-600 bg-surface-100/70 hover:bg-surface-100 dark:border-surface-800 dark:bg-surface-950/60 dark:text-surface-300 dark:hover:bg-surface-950/80 focus-visible:ring-primary-300 flex min-h-11 cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-9 lg:px-2 lg:py-1.5"
            >
              <span>
                Show code
                <span class="sr-only"> for {{ scenario.title }}</span>
              </span>
              <span
                :class="[
                  resolveIcon('chevron-down'),
                  'summary-cue text-muted-foreground inline-block h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                  openScenarioCode[scenario.key] ? 'rotate-180' : '',
                ]"
                aria-hidden="true"
              />
            </summary>
            <pre
              class="border-surface-200/70 text-surface-700 bg-surface-100/70 dark:border-surface-800 dark:bg-surface-950/75 dark:text-surface-300 mt-3 max-h-96 overflow-auto rounded-2xl border p-3 font-mono text-[11px] leading-5"
              >{{ buildScenarioCode(scenario) }}</pre
            >
          </details>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
</style>
