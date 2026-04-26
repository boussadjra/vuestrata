<script setup lang="ts">
import { useFormRepeater } from '@formwerk/core'

import type { FormRepeaterProps } from '~/types/forms'

const props = withDefaults(defineProps<FormRepeaterProps>(), {
  addButtonLabel: 'Add item',
  removeButtonLabel: 'Remove',
})

const { items, add, addButtonProps, Iteration } = useFormRepeater({
  name: () => props.name,
  min: () => props.min,
  max: () => props.max,
  addButtonLabel: () => props.addButtonLabel,
  removeButtonLabel: () => props.removeButtonLabel,
})
</script>

<template>
  <div>
    <component :is="Iteration" v-for="(key, index) in items" :key="key" :index="index">
      <template
        #default="{ removeButtonProps: itemRemoveProps, moveUpButtonProps, moveDownButtonProps }"
      >
        <slot
          :index="index"
          :key="key"
          :remove-button-props="itemRemoveProps"
          :move-up-button-props="moveUpButtonProps"
          :move-down-button-props="moveDownButtonProps"
        />
      </template>
    </component>

    <slot name="add" :add="() => add()" :add-button-props="addButtonProps">
      <button v-bind="addButtonProps" type="button" @click="add()">
        {{ addButtonLabel }}
      </button>
    </slot>
  </div>
</template>
