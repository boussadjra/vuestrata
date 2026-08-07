<script setup lang="ts">
const eventDate = ref<Date>()
const startTime = ref('')
const appointmentDate = ref<Date>()
const billingMonth = ref<Date>()
const graduationYear = ref<Date>()
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Date &amp; time inputs</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            DateField, TimeField, DatePicker, MonthPicker, and YearPicker.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UiDateField
          v-model="eventDate"
          name="eventDate"
          label="Event date"
          hint="Use arrow keys to navigate between segments"
        />

        <UiTimeField v-model="startTime" name="startTime" label="Start time" hint="Select a time" />

        <UiDatePicker
          v-model="appointmentDate"
          name="appointment"
          label="Appointment"
          hint="Click the calendar icon to pick"
        />

        <UiMonthPicker
          v-model="billingMonth"
          name="billing"
          label="Billing cycle"
          hint="Select the month"
        />

        <UiYearPicker
          v-model="graduationYear"
          name="graduation"
          label="Graduation year"
          hint="Select the year"
        />
      </div>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Live values</h3>
      </template>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Event date</dt>
          <dd class="text-surface-900 font-mono dark:text-white">
            {{ eventDate?.toLocaleDateString() ?? '—' }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Start time</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ startTime || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Appointment</dt>
          <dd class="text-surface-900 font-mono dark:text-white">
            {{ appointmentDate?.toLocaleDateString() ?? '—' }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Billing month</dt>
          <dd class="text-surface-900 font-mono dark:text-white">
            {{ billingMonth?.toLocaleDateString() ?? '—' }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Graduation year</dt>
          <dd class="text-surface-900 font-mono dark:text-white">
            {{ graduationYear?.toLocaleDateString() ?? '—' }}
          </dd>
        </div>
      </dl>
    </UiCard>
  </div>
</template>
