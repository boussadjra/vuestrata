<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const questions = ['backend', 'license', 'upgrade', 'alpha'] as const
</script>

<template>
  <section class="questions home-container" aria-labelledby="questions-title">
    <div class="questions-copy">
      <p class="home-eyebrow">{{ t('atelier_faq_eyebrow') }}</p>
      <h2 id="questions-title" class="home-heading">{{ t('atelier_faq_title') }}</h2>
      <p class="home-description">{{ t('atelier_faq_desc') }}</p>
    </div>
    <div class="question-list">
      <details v-for="question in questions" :key="question" class="question-item">
        <summary>
          <span>{{ t(`atelier_faq_${question}_q`) }}</span>
          <span class="question-plus" aria-hidden="true"><i /><i /></span>
        </summary>
        <p>{{ t(`atelier_faq_${question}_a`) }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.questions {
  display: grid;
  grid-template-columns: 0.75fr 1.1fr;
  align-items: start;
  gap: 8rem;
  padding-block: 5.5rem 6.5rem;
}
.questions-copy .home-heading {
  max-width: 15ch;
}
.questions-copy .home-description {
  max-width: 37ch;
  margin-block-start: 1.5rem;
}
.question-list {
  border-block-start: 1px solid var(--color-border);
}
.question-item {
  border-block-end: 1px solid var(--color-border);
}
.question-item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  min-height: 4.5rem;
  padding-block: 1.3rem;
  cursor: pointer;
  list-style: none;
  font-size: 0.85rem;
  font-weight: 600;
}
.question-item summary::-webkit-details-marker {
  display: none;
}
.question-item summary:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 5px;
  border-radius: var(--radius-sm);
}
.question-plus {
  position: relative;
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
  color: var(--color-link);
}
.question-plus i {
  position: absolute;
  inset-block-start: calc(50% - 0.5px);
  width: 100%;
  height: 1px;
  background: currentColor;
}
.question-plus i:last-child {
  transform: rotate(90deg);
  transition: transform 150ms;
}
.question-item[open] .question-plus i:last-child {
  transform: rotate(0);
}
.question-item > p {
  max-width: 62ch;
  padding-block-end: 1.5rem;
  padding-inline-end: 2rem;
  font-size: 0.8rem;
  line-height: 1.95;
  color: var(--color-muted-foreground);
}
@media (max-width: 1000px) {
  .questions {
    gap: 3.5rem;
  }
}
@media (max-width: 800px) {
  .questions {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding-block: 3.5rem;
  }
  .questions-copy .home-heading {
    max-width: 21ch;
  }
  .question-item summary {
    font-size: 0.9rem;
  }
  .question-item > p {
    padding-inline-end: 1rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .question-plus i:last-child {
    transition: none;
  }
}
</style>
