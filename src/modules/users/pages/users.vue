<script setup lang="ts">
/**
 * Route adapter for `/dashboard/users`.
 *
 * The route takes no input — access is decided by the guard from
 * `meta.requiredPermission` — so there is nothing to normalize and nothing to
 * coordinate. User management itself lives in `UsersScreen`.
 */
import UsersScreen from '../components/UsersScreen.vue'
</script>

<template>
  <UsersScreen />
</template>
