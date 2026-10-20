<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AppIcon from '@/components/ui/AppIcon.vue'

const { t } = useI18n()
const layers = [
  { name: 'managed', file: 'components/ui/UiButton.vue', suffix: '01' },
  { name: 'merged', file: 'core/lib/rbac/types.ts', suffix: '02' },
  { name: 'seeded', file: 'styles/brand.css', suffix: '03' },
] as const
</script>

<template>
  <section class="ownership-section" aria-labelledby="ownership-title">
    <div class="home-container ownership-content">
      <div class="ownership-copy">
        <p class="home-eyebrow">{{ t('atelier_ownership_eyebrow') }}</p>
        <h2 id="ownership-title" class="home-heading">{{ t('atelier_ownership_title') }}</h2>
        <p class="home-description">{{ t('atelier_ownership_desc') }}</p>
        <p class="ownership-note">{{ t('atelier_ownership_note') }}</p>
        <RouterLink to="/docs/getting-started/starting-a-project" class="ownership-guide">
          {{ t('atelier_ownership_guide') }} <AppIcon name="arrow-right" class="home-arrow" />
        </RouterLink>
      </div>
      <div class="ownership-sample">
        <ol class="ownership-layers">
          <li v-for="layer in layers" :key="layer.name" :class="`layer-${layer.name}`">
            <div class="ownership-layer-label">
              <span class="ownership-index home-number" aria-hidden="true">{{ layer.suffix }}</span
              ><code>{{ layer.name }}</code>
            </div>
            <h3>{{ t(`atelier_ownership_${layer.name}_title`) }}</h3>
            <p>{{ t(`atelier_ownership_${layer.name}_desc`) }}</p>
            <code class="ownership-file" dir="ltr">{{ layer.file }}</code>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ownership-section {
  position: relative;
  border-block: 1px solid var(--color-border);
  background: var(--color-muted);
}
.ownership-content {
  display: grid;
  grid-template-columns: 0.9fr 1fr;
  align-items: center;
  gap: 6rem;
  padding-block: 5.5rem;
}
.ownership-copy .home-heading {
  max-width: 15ch;
}
.ownership-copy .home-description {
  margin-block-start: 1.5rem;
}
.ownership-note {
  max-width: 48ch;
  margin-block-start: 1.5rem;
  font-size: 0.78rem;
  line-height: 1.9;
  color: var(--color-muted-foreground);
}
.ownership-guide {
  display: inline-flex;
  gap: 1rem;
  align-items: center;
  margin-block-start: 1.8rem;
  font-size: 0.78rem;
  font-weight: 600;
  text-underline-offset: 5px;
}
.ownership-guide:hover {
  text-decoration: underline;
}
.ownership-sample {
  min-width: 0;
}
.ownership-layers {
  list-style: none;
  display: grid;
  gap: 1rem;
}
.ownership-layers li {
  position: relative;
  padding: 1.3rem 1.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-foreground);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}
.ownership-layer-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-block-end: 0.75rem;
  font: 0.6rem/1.6 var(--font-mono);
  color: var(--color-muted-foreground);
}
.ownership-layers h3 {
  font-weight: 600;
  font-size: 0.85rem;
}
.ownership-layers p {
  margin-block: 0.5rem 0.8rem;
  font-size: 0.73rem;
  line-height: 1.8;
  color: var(--color-muted-foreground);
}
.ownership-file {
  display: block;
  overflow-wrap: anywhere;
  font: 0.61rem/1.8 var(--font-mono);
  color: var(--color-muted-foreground);
}
@media (max-width: 1000px) {
  .ownership-content {
    gap: 3rem;
  }
}
@media (max-width: 800px) {
  .ownership-content {
    grid-template-columns: 1fr;
    gap: 2.5rem;
    padding-block: 3.5rem;
  }
  .ownership-copy .home-heading {
    max-width: 21ch;
  }
  .ownership-layers li {
    padding: 1.2rem;
  }
}
</style>
