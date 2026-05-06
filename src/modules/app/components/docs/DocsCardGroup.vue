<template>
  <div class="docs-card-group my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <slot />
  </div>
</template>

<style scoped>
.docs-card-group :deep(.docs-card:first-child) {
  grid-column: span 2 / span 2;
}

@media (max-width: 639px) {
  .docs-card-group :deep(.docs-card:first-child) {
    grid-column: auto;
  }
}
</style>
