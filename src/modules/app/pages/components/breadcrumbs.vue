<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const usageCode = `<UiBreadcrumb :items="[
  { label: 'Home', to: '/' },
  { label: 'Components', to: '/components' },
  { label: 'Breadcrumb' },
]" />`

const twoLevelsCode = `<UiBreadcrumb :items="[
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Settings' },
]" />`

const deepNestingCode = `<UiBreadcrumb :items="[
  { label: 'Home', to: '/' },
  { label: 'Shop', to: '/shop' },
  { label: 'Electronics', to: '/shop' },
  { label: 'Laptops', to: '/shop' },
  { label: 'MacBook Pro 16' },
]" />`

const singleItemCode = `<UiBreadcrumb :items="[{ label: 'Home' }]" />`

const inPageCode = `<UiBreadcrumb :items="[
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Users', to: '/dashboard/users' },
  { label: 'User Details' },
]" />
<h3 class="text-xl font-bold">User Details</h3>
<p class="text-sm text-surface-500">View and manage user profile information.</p>`

const apiProps: ApiPropRow[] = [
  {
    name: 'items',
    type: '{ label, to?, icon? }[]',
    default: '[]',
    description: 'Breadcrumb segments. Last item without "to" is the current page.',
  },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Breadcrumb</h1>
      <p class="text-muted-foreground text-lg">
        Hierarchical navigation trail showing the current page location.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiBreadcrumb
          :items="[
            { label: 'Home', to: '/' },
            { label: 'Components', to: '/components' },
            { label: 'Breadcrumb' },
          ]"
        />
      </ComponentDemo>
    </section>

    <!-- Simple -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Two Levels</h2>
      <ComponentDemo :code="twoLevelsCode">
        <UiBreadcrumb :items="[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Settings' }]" />
      </ComponentDemo>
    </section>

    <!-- Deep Nesting -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Deep Nesting</h2>
      <ComponentDemo :code="deepNestingCode">
        <UiBreadcrumb
          :items="[
            { label: 'Home', to: '/' },
            { label: 'Shop', to: '/shop' },
            { label: 'Electronics', to: '/shop' },
            { label: 'Laptops', to: '/shop' },
            { label: 'MacBook Pro 16' },
          ]"
        />
      </ComponentDemo>
    </section>

    <!-- Single Item -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Single Item (Root)</h2>
      <ComponentDemo :code="singleItemCode">
        <UiBreadcrumb :items="[{ label: 'Home' }]" />
      </ComponentDemo>
    </section>

    <!-- In Context -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">In Page Context</h2>
      <p class="text-surface-500 text-sm">Breadcrumbs are typically placed above the page title.</p>
      <ComponentDemo :code="inPageCode">
        <div class="space-y-3">
          <UiBreadcrumb
            :items="[
              { label: 'Dashboard', to: '/dashboard' },
              { label: 'Users', to: '/dashboard/users' },
              { label: 'User Details' },
            ]"
          />
          <h3 class="text-xl font-bold">User Details</h3>
          <p class="text-surface-500 text-sm">View and manage user profile information.</p>
        </div>
      </ComponentDemo>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiBreadcrumb
          :items="[
            { label: 'Home', to: '/' },
            { label: 'Components', to: '/components' },
            { label: 'Breadcrumb' },
          ]"
        />
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
