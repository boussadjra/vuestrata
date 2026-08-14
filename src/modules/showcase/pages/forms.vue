<script setup lang="ts">
import { useTextField, useCheckbox, useNumberField } from '@formwerk/core'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { UiButton, UiPageHeader } from '@/components/ui'
import { useNotificationStore } from '@/stores/notification'
import { resolveIcon } from '~/config/icon-provider'

const notifications = useNotificationStore()
const { t } = useI18n()
const formwerkFieldOptions = { disableHtmlValidation: true }

// ─── Contact Form (Zod validated) ────────────────────────

const contactSchema = z.object({
  name: z.string().min(2, t('validation_name_min')),
  email: z.string().email(t('validation_email_invalid')),
  subject: z.string().min(3, t('validation_subject_required')),
  message: z.string().min(10, t('validation_message_min')),
  priority: z.enum(['low', 'medium', 'high']),
  agreeTerms: z.literal(true, { message: t('validation_agree_terms') }),
})

type ContactForm = z.infer<typeof contactSchema>

const contactData = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
  priority: 'medium',
  agreeTerms: false,
})
const contactErrors = ref<Record<string, string>>({})
const contactSubmitting = ref(false)

async function handleContactSubmit() {
  contactErrors.value = {}
  const result = contactSchema.safeParse(contactData)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string
      if (key && !contactErrors.value[key]) {
        contactErrors.value[key] = issue.message
      }
    }
    return
  }
  contactSubmitting.value = true
  await new Promise((r) => setTimeout(r, 1000))
  contactSubmitting.value = false
  notifications.add({
    type: 'success',
    title: t('forms_submitted_title'),
    message: t('forms_submitted_msg'),
  })
}

// ─── Formwerk Primitives Demo ────────────────────────────

const nameField = useTextField({
  label: 'Full Name',
  ...formwerkFieldOptions,
})
const emailField = useTextField({
  label: 'Email',
  type: 'email',
  ...formwerkFieldOptions,
})
const bioField = useTextField({ label: 'Bio', ...formwerkFieldOptions })
const ageField = useNumberField({ label: 'Age', min: 18, max: 120, ...formwerkFieldOptions })
const newsletter = useCheckbox({ label: 'Subscribe to newsletter', ...formwerkFieldOptions })
const primitiveRole = ref<'developer' | 'designer' | 'manager'>('developer')

// ─── Profile Form ────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, t('validation_first_name_required')),
  lastName: z.string().min(1, t('validation_last_name_required')),
  email: z.string().email(t('validation_email_invalid')),
  phone: z
    .string()
    .regex(/^\+?[\d\s-]{7,}$/, t('validation_phone_invalid'))
    .optional()
    .or(z.literal('')),
  company: z.string().optional(),
  role: z.enum(['developer', 'designer', 'manager', 'other']),
  bio: z.string().max(500, t('validation_bio_max')).optional(),
  notifications: z.boolean(),
  publicProfile: z.boolean(),
})

type ProfileForm = z.infer<typeof profileSchema>

const profileData = reactive<ProfileForm>({
  firstName: 'Demo',
  lastName: 'User',
  email: 'demo@vuestrata.dev',
  phone: '+1 555-0123',
  company: 'Vuestrata Labs',
  role: 'developer',
  bio: 'Building great things with Vue 3.',
  notifications: true,
  publicProfile: false,
})
const profileErrors = ref<Record<string, string>>({})
const profileSaving = ref(false)

async function handleProfileSubmit() {
  profileErrors.value = {}
  const result = profileSchema.safeParse(profileData)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string
      if (key && !profileErrors.value[key]) {
        profileErrors.value[key] = issue.message
      }
    }
    return
  }
  profileSaving.value = true
  await new Promise((r) => setTimeout(r, 1000))
  profileSaving.value = false
  notifications.add({
    type: 'success',
    title: t('forms_profile_saved_title'),
    message: t('forms_profile_saved_msg'),
  })
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8">
    <UiPageHeader :title="t('forms_title')" :description="t('forms_subtitle')" />

    <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <!-- Contact Form -->
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
      >
        <h2 class="text-surface-900 mb-1 text-xl font-bold dark:text-white">
          {{ t('forms_contact') }}
        </h2>
        <p class="text-muted-foreground mb-6 text-sm">
          {{ t('forms_contact_desc') }}
        </p>

        <form class="space-y-5" @submit.prevent="handleContactSubmit">
          <div>
            <label class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_name') }} *</label
            >
            <input
              v-model="contactData.name"
              type="text"
              :class="[
                'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                contactErrors.name
                  ? 'border-destructive focus:ring-danger-500/20'
                  : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
              ]"
              :placeholder="t('forms_name_placeholder')"
            />
            <p v-if="contactErrors.name" role="alert" class="text-destructive mt-1 text-xs">
              {{ contactErrors.name }}
            </p>
          </div>

          <div>
            <label class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_email') }} *</label
            >
            <input
              v-model="contactData.email"
              type="email"
              :class="[
                'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                contactErrors.email
                  ? 'border-destructive focus:ring-danger-500/20'
                  : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
              ]"
              :placeholder="t('forms_email_placeholder')"
            />
            <p v-if="contactErrors.email" role="alert" class="text-destructive mt-1 text-xs">
              {{ contactErrors.email }}
            </p>
          </div>

          <div>
            <label class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_subject') }} *</label
            >
            <input
              v-model="contactData.subject"
              type="text"
              :class="[
                'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                contactErrors.subject
                  ? 'border-destructive focus:ring-danger-500/20'
                  : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
              ]"
              :placeholder="t('forms_subject_placeholder')"
            />
            <p v-if="contactErrors.subject" role="alert" class="text-destructive mt-1 text-xs">
              {{ contactErrors.subject }}
            </p>
          </div>

          <div>
            <label class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_message') }} *</label
            >
            <textarea
              v-model="contactData.message"
              :rows="4"
              :class="[
                'bg-surface-50 dark:bg-surface-900 w-full resize-none rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                contactErrors.message
                  ? 'border-destructive focus:ring-danger-500/20'
                  : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
              ]"
              :placeholder="t('forms_message_placeholder')"
            />
            <p v-if="contactErrors.message" role="alert" class="text-destructive mt-1 text-xs">
              {{ contactErrors.message }}
            </p>
          </div>

          <div>
            <label class="text-foreground mb-1.5 block text-sm font-medium">{{
              t('forms_priority')
            }}</label>
            <div class="flex gap-3">
              <label
                v-for="p in ['low', 'medium', 'high']"
                :key="p"
                class="flex cursor-pointer items-center gap-2"
              >
                <input
                  v-model="contactData.priority"
                  type="radio"
                  name="priority"
                  :value="p"
                  class="accent-primary-500"
                />
                <span class="text-muted-foreground text-sm capitalize">{{ p }}</span>
              </label>
            </div>
          </div>

          <div>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="contactData.agreeTerms"
                type="checkbox"
                class="border-surface-300 dark:border-surface-600 accent-primary-500 rounded"
              />
              <span class="text-muted-foreground text-sm">{{ t('forms_agree_terms') }} *</span>
            </label>
            <p v-if="contactErrors.agreeTerms" role="alert" class="text-destructive mt-1 text-xs">
              {{ contactErrors.agreeTerms }}
            </p>
          </div>

          <UiButton type="submit" variant="primary" block :disabled="contactSubmitting">
            <span
              v-if="contactSubmitting"
              :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']"
            />
            {{ contactSubmitting ? t('forms_sending') : t('forms_send') }}
          </UiButton>
        </form>
      </div>

      <!-- Profile Settings Form -->
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
      >
        <h2 class="text-surface-900 mb-1 text-xl font-bold dark:text-white">
          {{ t('forms_profile') }}
        </h2>
        <p class="text-muted-foreground mb-6 text-sm">
          {{ t('forms_profile_desc') }}
        </p>

        <form class="space-y-5" @submit.prevent="handleProfileSubmit">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label
                for="profile-first-name"
                class="text-foreground mb-1.5 block text-sm font-medium"
                >{{ t('forms_first_name') }} *</label
              >
              <input
                id="profile-first-name"
                v-model="profileData.firstName"
                type="text"
                :class="[
                  'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                  profileErrors.firstName
                    ? 'border-destructive focus:ring-danger-500/20'
                    : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
                ]"
              />
              <p v-if="profileErrors.firstName" role="alert" class="text-destructive mt-1 text-xs">
                {{ profileErrors.firstName }}
              </p>
            </div>
            <div>
              <label
                for="profile-last-name"
                class="text-foreground mb-1.5 block text-sm font-medium"
                >{{ t('forms_last_name') }} *</label
              >
              <input
                id="profile-last-name"
                v-model="profileData.lastName"
                type="text"
                :class="[
                  'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                  profileErrors.lastName
                    ? 'border-destructive focus:ring-danger-500/20'
                    : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
                ]"
              />
              <p v-if="profileErrors.lastName" role="alert" class="text-destructive mt-1 text-xs">
                {{ profileErrors.lastName }}
              </p>
            </div>
          </div>

          <div>
            <label for="profile-email" class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_email') }} *</label
            >
            <input
              id="profile-email"
              v-model="profileData.email"
              type="email"
              :class="[
                'bg-surface-50 dark:bg-surface-900 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2',
                profileErrors.email
                  ? 'border-destructive focus:ring-danger-500/20'
                  : 'border-surface-200 dark:border-surface-700 focus:ring-primary-500/20 focus:border-primary-500',
              ]"
            />
            <p v-if="profileErrors.email" role="alert" class="text-destructive mt-1 text-xs">
              {{ profileErrors.email }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="profile-phone" class="text-foreground mb-1.5 block text-sm font-medium">{{
                t('forms_phone')
              }}</label>
              <input
                id="profile-phone"
                v-model="profileData.phone"
                type="tel"
                class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2"
              />
              <p v-if="profileErrors.phone" role="alert" class="text-destructive mt-1 text-xs">
                {{ profileErrors.phone }}
              </p>
            </div>
            <div>
              <label
                for="profile-company"
                class="text-foreground mb-1.5 block text-sm font-medium"
                >{{ t('forms_company') }}</label
              >
              <input
                id="profile-company"
                v-model="profileData.company"
                type="text"
                class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2"
              />
            </div>
          </div>

          <div>
            <label for="profile-role" class="text-foreground mb-1.5 block text-sm font-medium"
              >{{ t('forms_role') }} *</label
            >
            <select
              id="profile-role"
              v-model="profileData.role"
              class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2"
            >
              <option value="developer">{{ t('forms_developer') }}</option>
              <option value="designer">{{ t('forms_designer') }}</option>
              <option value="manager">{{ t('forms_manager') }}</option>
              <option value="other">{{ t('forms_other') }}</option>
            </select>
          </div>

          <div>
            <label for="profile-bio" class="text-foreground mb-1.5 block text-sm font-medium">{{
              t('forms_bio')
            }}</label>
            <textarea
              id="profile-bio"
              v-model="profileData.bio"
              :rows="3"
              class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full resize-none rounded-xl border px-3 py-2.5 text-sm transition-all outline-none focus:ring-2"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              {{ t('forms_char_count', { count: (profileData.bio ?? '').length }) }}
            </p>
          </div>

          <div class="space-y-3 pt-2">
            <label
              class="border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors"
            >
              <div>
                <p class="text-surface-900 text-sm font-medium dark:text-white">
                  {{ t('forms_email_notifications') }}
                </p>
                <p class="text-muted-foreground text-xs">
                  {{ t('forms_email_notifications_desc') }}
                </p>
              </div>
              <input
                v-model="profileData.notifications"
                type="checkbox"
                class="accent-primary-500 h-4 w-4"
              />
            </label>
            <label
              class="border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors"
            >
              <div>
                <p class="text-surface-900 text-sm font-medium dark:text-white">
                  {{ t('forms_public_profile') }}
                </p>
                <p class="text-muted-foreground text-xs">{{ t('forms_public_profile_desc') }}</p>
              </div>
              <input
                v-model="profileData.publicProfile"
                type="checkbox"
                class="accent-primary-500 h-4 w-4"
              />
            </label>
          </div>

          <UiButton type="submit" variant="primary" block :disabled="profileSaving">
            <span v-if="profileSaving" :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']" />
            {{ profileSaving ? t('forms_saving') : t('forms_save_profile') }}
          </UiButton>
        </form>
      </div>
    </div>

    <!-- Formwerk Primitives Showcase -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-2xl border bg-white/90 p-6 shadow-sm"
    >
      <h2 class="text-surface-900 mb-1 text-xl font-bold dark:text-white">
        {{ t('forms_primitives') }}
      </h2>
      <p class="text-muted-foreground mb-6 text-sm">
        {{ t('forms_primitives_desc') }}
      </p>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <!-- TextField -->
        <div class="space-y-1.5">
          <label
            v-bind="nameField.labelProps.value"
            class="text-foreground block text-sm font-medium"
            >{{ t('forms_full_name') }}</label
          >
          <input
            v-bind="nameField.inputProps.value"
            class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
            :placeholder="t('forms_enter_name')"
          />
        </div>

        <!-- Email -->
        <div class="space-y-1.5">
          <label
            v-bind="emailField.labelProps.value"
            class="text-foreground block text-sm font-medium"
            >{{ t('forms_email') }}</label
          >
          <input
            v-bind="emailField.inputProps.value"
            class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
            :placeholder="t('forms_you_email_placeholder')"
          />
        </div>

        <!-- NumberField -->
        <div class="space-y-1.5">
          <label class="text-foreground block text-sm font-medium">{{ t('forms_age') }}</label>
          <div class="flex items-center gap-2">
            <UiButton v-bind="ageField.decrementButtonProps.value" variant="secondary" size="sm">
              −
            </UiButton>
            <input
              v-bind="ageField.inputProps.value"
              class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 text-center text-sm outline-none focus:ring-2"
            />
            <UiButton v-bind="ageField.incrementButtonProps.value" variant="secondary" size="sm">
              +
            </UiButton>
          </div>
        </div>

        <!-- TextArea -->
        <div class="space-y-1.5 md:col-span-2">
          <label
            v-bind="bioField.labelProps.value"
            class="text-foreground block text-sm font-medium"
            >{{ t('forms_bio') }}</label
          >
          <textarea
            v-bind="bioField.inputProps.value as Record<string, unknown>"
            :rows="3"
            class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
            :placeholder="t('forms_bio_placeholder')"
          />
        </div>

        <!-- Checkbox -->
        <div class="flex items-center gap-3">
          <input
            v-bind="newsletter.inputProps.value"
            type="checkbox"
            class="border-surface-300 dark:border-surface-600 accent-primary-500 h-4 w-4 rounded"
          />
          <label v-bind="newsletter.labelProps.value" class="text-foreground text-sm">{{
            t('forms_subscribe_newsletter')
          }}</label>
        </div>

        <!-- RadioGroup -->
        <fieldset class="space-y-2">
          <legend class="text-foreground block text-sm font-medium">
            {{ t('forms_preferred_role') }}
          </legend>
          <div class="space-y-2">
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="primitiveRole"
                type="radio"
                name="primitive-role"
                value="developer"
                class="accent-primary-500"
              />
              <span class="text-muted-foreground text-sm">{{ t('forms_developer') }}</span>
            </label>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="primitiveRole"
                type="radio"
                name="primitive-role"
                value="designer"
                class="accent-primary-500"
              />
              <span class="text-muted-foreground text-sm">{{ t('forms_designer') }}</span>
            </label>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="primitiveRole"
                type="radio"
                name="primitive-role"
                value="manager"
                class="accent-primary-500"
              />
              <span class="text-muted-foreground text-sm">{{ t('forms_manager') }}</span>
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  </div>
</template>
