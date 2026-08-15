<script setup lang="ts">
/**
 * Route adapter for `/dashboard/audit`.
 *
 * The route takes no input and the whole page is one feature surface, so this
 * file does what a route adapter does and nothing more: it names the screen and
 * gives it a heading.
 */
import { useI18n } from 'vue-i18n'

import { UiPageHeader } from '@/components/ui'

import AuditLogScreen from '../components/AuditLogScreen.vue'

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <UiPageHeader :title="t('audit_title')" :description="t('audit_subtitle')" />
    <AuditLogScreen />
  </div>
</template>
