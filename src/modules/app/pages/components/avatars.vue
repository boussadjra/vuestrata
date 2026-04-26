<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const propDefs: PropDef[] = [
  {
    name: 'size',
    type: 'select',
    default: 'md',
    options: [
      { label: 'xs', value: 'xs' },
      { label: 'sm', value: 'sm' },
      { label: 'md', value: 'md' },
      { label: 'lg', value: 'lg' },
      { label: 'xl', value: 'xl' },
    ],
  },
  { name: 'alt', type: 'string', default: 'John Doe' },
  { name: 'fallback', type: 'string', default: '' },
]

const usageCode = `<UiAvatar alt="John Doe" />`

const sizesCode = `<UiAvatar size="xs" alt="XS" />
<UiAvatar size="sm" alt="SM" />
<UiAvatar size="md" alt="MD" />
<UiAvatar size="lg" alt="LG" />
<UiAvatar size="xl" alt="XL" />`

const imageCode = `<UiAvatar size="lg" src="https://i.pravatar.cc/150?u=alice" alt="Alice" />
<UiAvatar size="lg" src="https://i.pravatar.cc/150?u=bob" alt="Bob" />
<UiAvatar size="lg" src="https://i.pravatar.cc/150?u=carol" alt="Carol" />`

const fallbackCode = `<UiAvatar size="lg" alt="John Doe" />
<UiAvatar size="lg" alt="Alice Wonderland" />
<UiAvatar size="lg" fallback="VY" />
<UiAvatar size="lg" fallback="?" />`

const stackCode = `<div class="flex -space-x-3">
  <UiAvatar size="md" src="https://i.pravatar.cc/150?u=u1" alt="User 1" class="ring-2 ring-white dark:ring-surface-900" />
  <UiAvatar size="md" src="https://i.pravatar.cc/150?u=u2" alt="User 2" class="ring-2 ring-white dark:ring-surface-900" />
  <UiAvatar size="md" src="https://i.pravatar.cc/150?u=u3" alt="User 3" class="ring-2 ring-white dark:ring-surface-900" />
  <UiAvatar size="md" fallback="+5" class="ring-2 ring-white dark:ring-surface-900" />
</div>`

const apiProps: ApiPropRow[] = [
  { name: 'src', type: 'string', description: 'Image source URL' },
  { name: 'alt', type: 'string', description: 'Alt text (also used for fallback initials)' },
  { name: 'fallback', type: 'string', description: 'Custom fallback text when no image' },
  {
    name: 'size',
    type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'",
    default: "'md'",
    description: 'Avatar size',
  },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Avatar</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        User or entity representation with image, fallback initials, and multiple sizes.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiAvatar alt="John Doe" />
      </ComponentDemo>
    </section>

    <!-- Sizes -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Sizes</h2>
      <ComponentDemo :code="sizesCode">
        <div class="flex items-end gap-4">
          <div class="text-center">
            <UiAvatar size="xs" alt="XS" />
            <p class="text-surface-500 mt-1 text-[10px]">xs</p>
          </div>
          <div class="text-center">
            <UiAvatar size="sm" alt="SM" />
            <p class="text-surface-500 mt-1 text-[10px]">sm</p>
          </div>
          <div class="text-center">
            <UiAvatar size="md" alt="MD" />
            <p class="text-surface-500 mt-1 text-[10px]">md</p>
          </div>
          <div class="text-center">
            <UiAvatar size="lg" alt="LG" />
            <p class="text-surface-500 mt-1 text-[10px]">lg</p>
          </div>
          <div class="text-center">
            <UiAvatar size="xl" alt="XL" />
            <p class="text-surface-500 mt-1 text-[10px]">xl</p>
          </div>
        </div>
      </ComponentDemo>
    </section>

    <!-- With Image -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Image</h2>
      <ComponentDemo :code="imageCode">
        <div class="flex items-center gap-4">
          <UiAvatar size="lg" src="https://i.pravatar.cc/150?u=alice" alt="Alice" />
          <UiAvatar size="lg" src="https://i.pravatar.cc/150?u=bob" alt="Bob" />
          <UiAvatar size="lg" src="https://i.pravatar.cc/150?u=carol" alt="Carol" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Fallback Initials -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Fallback Initials</h2>
      <p class="text-surface-500 text-sm">
        When no
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">src</code> is
        provided, initials are generated from
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs">alt</code> or
        you can set
        <code class="bg-surface-100 dark:bg-surface-800 rounded px-1.5 py-0.5 text-xs"
          >fallback</code
        >
        directly.
      </p>
      <ComponentDemo :code="fallbackCode">
        <div class="flex items-center gap-4">
          <UiAvatar size="lg" alt="John Doe" />
          <UiAvatar size="lg" alt="Alice Wonderland" />
          <UiAvatar size="lg" fallback="VY" />
          <UiAvatar size="lg" fallback="?" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Avatar Group -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Avatar Stack</h2>
      <p class="text-surface-500 text-sm">
        Combine avatars with negative margin for a stacked group.
      </p>
      <ComponentDemo :code="stackCode">
        <div class="flex -space-x-3">
          <UiAvatar
            size="md"
            src="https://i.pravatar.cc/150?u=u1"
            alt="User 1"
            class="dark:ring-surface-900 ring-2 ring-white"
          />
          <UiAvatar
            size="md"
            src="https://i.pravatar.cc/150?u=u2"
            alt="User 2"
            class="dark:ring-surface-900 ring-2 ring-white"
          />
          <UiAvatar
            size="md"
            src="https://i.pravatar.cc/150?u=u3"
            alt="User 3"
            class="dark:ring-surface-900 ring-2 ring-white"
          />
          <UiAvatar size="md" fallback="+5" class="dark:ring-surface-900 ring-2 ring-white" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiAvatar v-bind="p" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <div class="flex items-center gap-4">
          <UiAvatar alt="John Doe" />
          <UiAvatar size="lg" src="https://i.pravatar.cc/150?u=alice" alt="Alice" />
          <UiAvatar size="sm" fallback="VY" />
        </div>
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
