<script setup lang="ts">
const name = ref('')
const role = ref('member')
const notes = ref('Prefers concise release notes and weekly status updates.')
const agreed = ref(true)

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' },
  { label: 'Viewer', value: 'viewer' },
]

const status = computed(() => {
  if (!name.value) return 'Waiting for input'
  return `${name.value} will be created as ${role.value}`
})
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Team member form</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Inputs, select, textarea, and checkbox working together.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UiTextField v-model="name" label="Full Name" placeholder="Enter full name" />
        <UiSelect v-model="role" label="Role" :options="roleOptions" />
        <UiTextarea v-model="notes" label="Notes" :rows="4" />
        <UiCheckbox v-model="agreed" label="Send onboarding email automatically" />
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3">
          <span class="text-surface-500 dark:text-surface-400 text-sm">{{ status }}</span>
          <UiButton variant="primary">Save Member</UiButton>
        </div>
      </template>
    </UiCard>

    <UiAlert :variant="agreed ? 'success' : 'warning'" title="Preview state">
      <p>{{ status }}</p>
    </UiAlert>
  </div>
</template>
