<script setup lang="ts">
import AppRoot from '@/components/layout/AppRoot.vue'
</script>

<!--
  Yours. The root component is `AppRoot`, which Vuestrata maintains: theme and
  locale sync, the error boundary and the route outlet. Wrap it, or put
  something beside it (a global toast host, a cookie banner), rather than
  copying its contents here — a copy stops receiving fixes.
-->
<template>
  <AppRoot />
</template>
