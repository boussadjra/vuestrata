<script setup lang="ts">
const country = ref('')
const timezone = ref('')
const skills = ref<string[]>([])
const category = ref('')
const verifyCode = ref('')

const countryOptions = [
  { label: 'United States', value: 'US' },
  { label: 'Canada', value: 'CA' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'Germany', value: 'DE' },
  { label: 'France', value: 'FR' },
]

const timezoneOptions = [
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Paris', value: 'Europe/Paris' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
]

const categoryNodes = [
  {
    label: 'Electronics',
    value: 'electronics',
    children: [
      { label: 'Phones', value: 'phones' },
      { label: 'Laptops', value: 'laptops' },
      { label: 'Tablets', value: 'tablets' },
    ],
  },
  {
    label: 'Clothing',
    value: 'clothing',
    children: [
      { label: 'Men', value: 'men' },
      { label: 'Women', value: 'women' },
    ],
  },
  { label: 'Books', value: 'books' },
]
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Selection inputs</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            Select, ComboBox, TagsField, TreeSelect, and OTPField.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UiSelect
          v-model="country"
          name="country"
          label="Country"
          placeholder="Choose a country…"
          :options="countryOptions"
          hint="Select your country of residence"
        />

        <UiComboBox
          v-model="timezone"
          name="timezone"
          label="Timezone"
          placeholder="Search timezones…"
          :options="timezoneOptions"
          hint="Start typing to filter"
        />

        <UiTagsField
          v-model="skills"
          name="skills"
          label="Skills"
          placeholder="Add a skill…"
          hint="Press Enter or comma to add"
          :max-tags="5"
        />

        <UiTreeSelect
          v-model="category"
          name="category"
          label="Category"
          placeholder="Select a category…"
          :nodes="categoryNodes"
          hint="Expand categories to see sub-items"
        />

        <UiOTPField
          v-model="verifyCode"
          name="otp"
          label="Verification code"
          :length="6"
          hint="Enter the 6-digit code"
        />
      </div>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Live values</h3>
      </template>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Country</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ country || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Timezone</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ timezone || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Skills</dt>
          <dd class="text-surface-900 font-mono dark:text-white">
            {{ skills.length ? skills.join(', ') : '—' }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Category</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ category || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">OTP code</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ verifyCode || '—' }}</dd>
        </div>
      </dl>
    </UiCard>
  </div>
</template>
