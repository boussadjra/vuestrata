<script setup lang="ts">
const agreed = ref(false)
const notifications = ref(true)
const featured = ref(false)
const plan = ref('pro')
const viewMode = ref('grid')

const planOptions = [
  { label: 'Starter — Free', value: 'starter' },
  { label: 'Pro — $9/mo', value: 'pro', description: 'Priority support included' },
  { label: 'Team — $29/mo', value: 'team', description: 'Up to 10 members' },
]

const viewOptions = [
  { label: 'Grid', value: 'grid' },
  { label: 'List', value: 'list' },
  { label: 'Table', value: 'table' },
]
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Choice inputs</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Checkbox, Switch, Toggle, RadioGroup, and ToggleGroup.
          </p>
        </div>
      </template>

      <div class="space-y-5">
        <UiCheckbox v-model="agreed" name="agree" label="I agree to the terms and conditions" />

        <UiSwitch v-model="notifications" name="notifications" label="Email notifications" />

        <UiToggle v-model="featured" name="featured" label="Featured" />

        <UiRadioGroup
          v-model="plan"
          name="plan"
          label="Subscription plan"
          :options="planOptions"
          hint="You can upgrade at any time"
        />

        <UiToggleGroup v-model="viewMode" name="view" label="Layout view" :options="viewOptions" />
      </div>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Live state</h3>
      </template>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Agreed</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ agreed }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Notifications</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ notifications }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Featured</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ featured }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Plan</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ plan }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-surface-500 dark:text-surface-400">View mode</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ viewMode }}</dd>
        </div>
      </dl>
    </UiCard>
  </div>
</template>
