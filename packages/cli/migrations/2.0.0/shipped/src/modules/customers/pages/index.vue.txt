<script setup lang="ts">
import { useListRouteState } from '@/composables/useListRouteState'

import CustomersScreen from '../components/CustomersScreen.vue'
import { customersListQueryModel } from '../query-model'

const queryState = useListRouteState(customersListQueryModel)
</script>

<template>
  <CustomersScreen :query-state="queryState" />
</template>
