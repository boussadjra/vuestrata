<script setup lang="ts">
import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'

const router = useRouter()
</script>

<template>
  <div class="bg-surface-50 dark:bg-surface-950 flex min-h-screen items-center justify-center">
    <div class="max-w-md px-6 text-center">
      <div
        class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30"
      >
        <span :class="[resolveIcon('shield-warning'), 'h-10 w-10 text-red-500']" />
      </div>
      <h1 class="mb-3 text-6xl font-extrabold text-red-500">403</h1>
      <h2 class="text-surface-800 mb-2 text-xl font-bold dark:text-white">Access Denied</h2>
      <p class="text-surface-500 dark:text-surface-400 mb-8">
        You don't have permission to access this page. Contact your administrator if you believe
        this is an error.
      </p>
      <div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <UiButton variant="primary" @click="router.push('/dashboard')">
          <span :class="[resolveIcon('home'), 'h-5 w-5']" />
          Go to Dashboard
        </UiButton>
        <UiButton variant="secondary" @click="router.back()">
          <span :class="[resolveIcon('arrow-left'), 'h-5 w-5']" />
          Go Back
        </UiButton>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: blank
</route>
