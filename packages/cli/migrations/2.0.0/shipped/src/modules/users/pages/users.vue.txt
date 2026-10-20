<script setup lang="ts">
/**
 * Route adapter for `/dashboard/users`.
 *
 * Decode shareable list state here; access is decided by the route guard and
 * user-management workflows stay inside UsersScreen.
 */
import { useListRouteState } from '@/composables/useListRouteState'

import UsersScreen from '../components/UsersScreen.vue'
import { createUsersListQueryModel } from '../query-model'

const queryState = useListRouteState(createUsersListQueryModel())
</script>

<template>
  <UsersScreen :query-state="queryState" />
</template>
