<script setup lang="ts">
const username = ref('johndoe')
const email = ref('')
const quantity = ref(3)
const bio = ref('')
const searchQuery = ref('')
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Text inputs</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            TextField, SearchField, NumberField, and Textarea in action.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UiTextField
          v-model="username"
          name="username"
          label="Username"
          placeholder="e.g. johndoe"
          hint="3–20 characters, letters and numbers only"
          required
        />
        <UiTextField
          v-model="email"
          name="email"
          label="Email address"
          type="email"
          placeholder="you@example.com"
          hint="We'll never share your email"
          required
        />
        <UiSearchField
          v-model="searchQuery"
          name="search"
          label="Search products"
          placeholder="Search by name or SKU…"
          hint="Press Enter to search"
        />
        <UiNumberField
          v-model="quantity"
          name="quantity"
          label="Quantity"
          :min="1"
          :max="99"
          :step="1"
          hint="Use – / + buttons or type a number"
        />
        <UiTextarea
          v-model="bio"
          name="bio"
          label="Bio"
          placeholder="Tell us about yourself…"
          :rows="3"
          hint="Max 500 characters"
        />
      </div>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Live values</h3>
      </template>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Username</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ username || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Email</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ email || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Search</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ searchQuery || '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Quantity</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ quantity }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted-foreground">Bio</dt>
          <dd class="text-surface-900 max-w-48 truncate font-mono dark:text-white">
            {{ bio || '—' }}
          </dd>
        </div>
      </dl>
    </UiCard>
  </div>
</template>
