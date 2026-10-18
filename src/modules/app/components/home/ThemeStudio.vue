<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const { themes, currentThemeName, currentTheme, setTheme } = useTheme()
</script>

<template>
  <section class="studio home-container" aria-labelledby="studio-title">
    <div class="studio-copy">
      <p class="home-eyebrow">{{ t('atelier_design_eyebrow') }}</p>
      <h2 id="studio-title" class="home-heading">{{ t('atelier_design_title') }}</h2>
      <p class="home-description">{{ t('atelier_design_desc') }}</p>
      <div class="theme-choices" role="group" :aria-label="t('atelier_theme_choices')">
        <button
          v-for="theme in themes"
          :key="theme.name"
          type="button"
          :aria-pressed="currentThemeName === theme.name"
          :class="{ selected: currentThemeName === theme.name }"
          @click="setTheme(theme.name)"
        >
          <span v-if="currentThemeName === theme.name" aria-hidden="true">✓</span>
          {{ theme.label }}
        </button>
      </div>
      <p class="studio-note">{{ t('atelier_design_note') }}</p>
    </div>
    <div class="type-specimen">
      <div class="specimen-topline">
        <span>{{ t('atelier_specimen') }}</span
        ><span>{{ currentTheme.label }}</span>
      </div>
      <div class="specimen-letters" aria-hidden="true">Aa<span>.</span></div>
      <p class="specimen-title">{{ t('atelier_specimen_title') }}</p>
      <div class="specimen-rule" />
      <div class="specimen-bottom">
        <span class="specimen-status"
          ><span aria-hidden="true" />{{ t('atelier_specimen_status') }}</span
        >
        <UiButton to="/docs/theming/overview" size="sm"
          >{{ t('atelier_design_guide') }} <span aria-hidden="true">↗</span></UiButton
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio {
  display: grid;
  grid-template-columns: 1fr 0.9fr;
  align-items: center;
  gap: 5rem;
  padding-block: 6.5rem;
}
.home-heading {
  max-width: 15ch;
}
.home-description {
  margin-block-start: 1.5rem;
}
.theme-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-block-start: 2rem;
}
.theme-choices button {
  min-height: 2.65rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-card);
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    color 150ms,
    border-color 150ms,
    background 150ms;
}
.theme-choices button.selected {
  border-color: var(--color-primary-solid);
  background: var(--color-primary-solid);
  color: var(--color-primary-foreground);
}
.theme-choices button:hover:not(.selected) {
  color: var(--color-foreground);
  border-color: var(--color-ring);
}
.studio-note {
  margin-block-start: 1.25rem;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  line-height: 1.7;
}
.type-specimen {
  padding: 1.6rem 2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card);
}
.specimen-topline {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.65rem;
  color: var(--color-muted-foreground);
}
.specimen-topline > span:first-child {
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.specimen-letters {
  padding-block: 0.7rem 0;
  font: 400 clamp(7rem, 14vw, 12rem)/1.15 var(--font-display, var(--font-sans));
  letter-spacing: -0.07em;
  color: var(--color-foreground);
}
.specimen-letters > span {
  color: var(--color-primary-solid);
}
.specimen-title {
  max-width: 18ch;
  margin-block: 0 2rem;
  font: 400 1.6rem/1.2 var(--font-display, var(--font-sans));
}
.specimen-rule {
  height: 1px;
  background: var(--color-border);
}
.specimen-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding-block-start: 1.5rem;
}
.specimen-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-muted-foreground);
  font-size: 0.7rem;
}
.specimen-status > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary-solid);
}
@media (max-width: 850px) {
  .studio {
    grid-template-columns: 1fr;
    gap: 2.5rem;
    padding-block: 4rem;
  }
  .type-specimen {
    max-width: 36rem;
    width: 100%;
  }
  .specimen-letters {
    font-size: 10rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .theme-choices button {
    transition: none;
  }
}
</style>
