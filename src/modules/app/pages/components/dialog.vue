<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'

const basicOpen = ref(false)
const confirmOpen = ref(false)
const formOpen = ref(false)
const scrollOpen = ref(false)
const playgroundOpen = ref(false)

const propDefs: PropDef[] = [
  { name: 'title', type: 'string', default: 'Dialog Title' },
  { name: 'description', type: 'string', default: 'Dialog description goes here.' },
]

const usageCode = `<UiDialog v-model="open" title="Basic Dialog" description="This is a simple dialog example.">
  <template #trigger>
    <UiButton>Open Dialog</UiButton>
  </template>
  <p class="text-sm text-muted-foreground">Here is the dialog content.</p>
</UiDialog>`

const confirmCode = `<UiDialog v-model="confirmOpen" title="Delete Item" description="This action cannot be undone.">
  <template #trigger>
    <UiButton variant="destructive">Delete</UiButton>
  </template>
  <p class="text-sm text-muted-foreground">
    Are you sure you want to delete this item? All associated data will be permanently removed.
  </p>
  <template #footer>
    <div class="flex justify-end gap-2">
      <UiButton variant="ghost" @click="confirmOpen = false">Cancel</UiButton>
      <UiButton variant="destructive" @click="confirmOpen = false">Delete</UiButton>
    </div>
  </template>
</UiDialog>`

const formCode = `<UiDialog v-model="formOpen" title="Create New Item" description="Fill in the details below.">
  <template #trigger>
    <UiButton>Create Item</UiButton>
  </template>
  <div class="space-y-4">
    <UiTextField label="Name" placeholder="Item name" />
    <UiTextarea label="Description" placeholder="Describe the item" :rows="3" />
    <UiSelect label="Category" :items="[...]" />
  </div>
  <template #footer>
    <div class="flex justify-end gap-2">
      <UiButton variant="ghost" @click="formOpen = false">Cancel</UiButton>
      <UiButton @click="formOpen = false">Create</UiButton>
    </div>
  </template>
</UiDialog>`

const scrollCode = `<UiDialog v-model="scrollOpen" title="Terms of Service" description="Please read the following terms carefully.">
  <template #trigger>
    <UiButton variant="secondary">View Terms</UiButton>
  </template>
  <div class="max-h-60 overflow-y-auto space-y-4 text-sm text-muted-foreground">
    <p>Lorem ipsum dolor sit amet...</p>
  </div>
  <template #footer>
    <div class="flex justify-end gap-2">
      <UiButton variant="ghost" @click="scrollOpen = false">Decline</UiButton>
      <UiButton @click="scrollOpen = false">Accept</UiButton>
    </div>
  </template>
</UiDialog>`

const apiProps: ApiPropRow[] = [
  {
    name: 'modelValue',
    type: 'boolean',
    default: 'false',
    description: 'Controls open/close state',
  },
  { name: 'title', type: 'string', description: 'Dialog header title' },
  { name: 'description', type: 'string', description: 'Dialog header description' },
]

const apiSlots: ApiSlotRow[] = [
  { name: 'trigger', description: 'Element that triggers the dialog open' },
  { name: 'default', description: 'Dialog body content' },
  { name: 'footer', description: 'Footer area for action buttons' },
]
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Dialog</h1>
      <p class="text-muted-foreground text-lg">
        A modal overlay that focuses attention on a critical interaction or message.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiDialog
          v-model="basicOpen"
          title="Basic Dialog"
          description="This is a simple dialog example."
        >
          <template #trigger>
            <UiButton>Open Dialog</UiButton>
          </template>
          <p class="text-muted-foreground text-sm">
            Here is the dialog content. You can place any elements inside.
          </p>
        </UiDialog>
      </ComponentDemo>
    </section>

    <!-- Confirmation Dialog -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Confirmation</h2>
      <ComponentDemo :code="confirmCode">
        <UiDialog
          v-model="confirmOpen"
          title="Delete Item"
          description="This action cannot be undone."
        >
          <template #trigger>
            <UiButton variant="destructive">Delete</UiButton>
          </template>
          <p class="text-muted-foreground text-sm">
            Are you sure you want to delete this item? All associated data will be permanently
            removed.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UiButton variant="ghost" @click="confirmOpen = false">Cancel</UiButton>
              <UiButton variant="destructive" @click="confirmOpen = false">Delete</UiButton>
            </div>
          </template>
        </UiDialog>
      </ComponentDemo>
    </section>

    <!-- With Form -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">With Form</h2>
      <ComponentDemo :code="formCode">
        <UiDialog
          v-model="formOpen"
          title="Create New Item"
          description="Fill in the details below."
        >
          <template #trigger>
            <UiButton>Create Item</UiButton>
          </template>
          <div class="space-y-4">
            <UiTextField label="Name" placeholder="Item name" />
            <UiTextarea label="Description" placeholder="Describe the item" :rows="3" />
            <UiSelect
              label="Category"
              :options="[
                { label: 'Electronics', value: 'electronics' },
                { label: 'Clothing', value: 'clothing' },
                { label: 'Books', value: 'books' },
              ]"
            />
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UiButton variant="ghost" @click="formOpen = false">Cancel</UiButton>
              <UiButton @click="formOpen = false">Create</UiButton>
            </div>
          </template>
        </UiDialog>
      </ComponentDemo>
    </section>

    <!-- Scrollable Content -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Scrollable Content</h2>
      <ComponentDemo :code="scrollCode">
        <UiDialog
          v-model="scrollOpen"
          title="Terms of Service"
          description="Please read the following terms carefully."
        >
          <template #trigger>
            <UiButton variant="secondary">View Terms</UiButton>
          </template>
          <div class="text-muted-foreground max-h-60 space-y-4 overflow-y-auto text-sm">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
              exercitation ullamco laboris.
            </p>
            <p>
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
              nulla pariatur. Excepteur sint occaecat cupidatat non proident.
            </p>
            <p>
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
              laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis.
            </p>
            <p>
              Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
              consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
            </p>
            <p>
              At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
              voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi.
            </p>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UiButton variant="ghost" @click="scrollOpen = false">Decline</UiButton>
              <UiButton @click="scrollOpen = false">Accept</UiButton>
            </div>
          </template>
        </UiDialog>
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiDialog v-model="playgroundOpen" v-bind="p">
            <template #trigger>
              <UiButton>Open Dialog</UiButton>
            </template>
            <p class="text-muted-foreground text-sm">Dialog content goes here.</p>
          </UiDialog>
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiDialog
          v-model="basicOpen"
          title="Basic Dialog"
          description="This is a simple dialog example."
        >
          <template #trigger>
            <UiButton>Open Dialog</UiButton>
          </template>
          <p class="text-sm">Dialog content.</p>
        </UiDialog>
        <UiDialog
          v-model="confirmOpen"
          title="Delete Item"
          description="This action cannot be undone."
        >
          <template #trigger>
            <UiButton variant="destructive">Delete</UiButton>
          </template>
          <p class="text-sm">Confirmation content.</p>
        </UiDialog>
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :slots="apiSlots" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
