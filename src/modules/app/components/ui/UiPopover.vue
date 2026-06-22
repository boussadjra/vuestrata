<script setup lang="ts">
import {
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { resolveIcon } from '~/config/icon-provider'

export interface PopoverProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

const props = withDefaults(defineProps<PopoverProps>(), {
  side: 'bottom',
  align: 'center',
})

const { t } = useI18n()
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :side="props.side"
        :align="props.align"
        :side-offset="8"
        class="shaped-border shaped-radius-lg shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 animate-scale-in z-50 w-72 border bg-white p-4 outline-none"
        data-ui="popover"
        data-provider="reka"
      >
        <slot />
        <PopoverClose
          class="shaped-radius-sm hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-2 right-2 p-1 transition-colors"
          :aria-label="t('button_close')"
        >
          <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
        </PopoverClose>
        <PopoverArrow class="dark:fill-surface-800 fill-white" :width="12" :height="6" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
