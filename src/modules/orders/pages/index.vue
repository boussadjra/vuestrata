<script setup lang="ts">
import { useListRouteState } from '@/composables/useListRouteState'

import OrdersScreen from '../components/OrdersScreen.vue'
import { ordersListQueryModel } from '../query-model'

const queryState = useListRouteState(ordersListQueryModel)
</script>

<template>
  <OrdersScreen :query-state="queryState" />
</template>
