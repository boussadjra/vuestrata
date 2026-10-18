<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '@/types'

import FoundationPreview from './FoundationPreview.vue'
import HomeOwnership from './HomeOwnership.vue'
import HomeQuestions from './HomeQuestions.vue'
import HomeWorkflow from './HomeWorkflow.vue'
import ThemeStudio from './ThemeStudio.vue'

const { t } = useI18n()
const principles: { key: string; icon: IconName; path: string }[] = [
  { key: 'boundaries', icon: 'database', path: 'router → page → feature → shared' },
  { key: 'auth', icon: 'shield-check', path: 'mock · JWT · OAuth · session' },
  { key: 'toolchain', icon: 'bolt', path: 'install · check · test · build' },
]
const stack = ['vue', 'ts', 'tailwind', 'vite', 'pinia', 'reka'] as const
</script>

<template>
  <div class="home-experience">
    <section class="home-hero home-container" aria-labelledby="home-title">
      <div class="hero-intro">
        <p class="home-eyebrow">
          <span class="eyebrow-rule" aria-hidden="true" />{{ t('atelier_eyebrow') }}
        </p>
        <h1 id="home-title">
          {{ t('atelier_title') }}<br /><em>{{ t('atelier_title_emphasis') }}</em>
        </h1>
        <p class="hero-description">{{ t('atelier_description') }}</p>
        <div class="hero-actions">
          <UiButton to="/docs/components/overview" size="lg"
            >{{ t('hero_explore') }} <span aria-hidden="true">↗</span></UiButton
          >
          <UiButton to="/dashboard" variant="ghost" size="lg"
            >{{ t('hero_dashboard') }} <span aria-hidden="true">→</span></UiButton
          >
        </div>
        <p class="hero-footnote">{{ t('atelier_hero_note') }}</p>
      </div>
      <div class="hero-visual">
        <FoundationPreview />
        <div class="visual-caption">
          <span>01 / {{ t('atelier_preview_caption') }}</span
          ><span aria-hidden="true">↓</span>
        </div>
      </div>
      <div class="hero-baseline">
        <span>{{ t('atelier_built_with') }}</span>
        <ul>
          <li v-for="item in stack" :key="item">{{ t(`home_stack_${item}_label`) }}</li>
        </ul>
      </div>
    </section>

    <section class="foundation-section" aria-labelledby="foundation-title">
      <div class="home-container foundation-content">
        <div class="foundation-intro">
          <p class="home-eyebrow">{{ t('atelier_foundation_eyebrow') }}</p>
          <h2 id="foundation-title" class="home-heading">{{ t('atelier_foundation_title') }}</h2>
          <p class="home-description">{{ t('atelier_foundation_desc') }}</p>
          <RouterLink to="/docs/architecture/overview" class="home-text-link"
            >{{ t('atelier_architecture_link') }} <span aria-hidden="true">↗</span></RouterLink
          >
        </div>
        <ol class="principles">
          <li v-for="(principle, index) in principles" :key="principle.key">
            <span class="principle-number">0{{ index + 1 }}</span>
            <div>
              <h3>{{ t(`atelier_${principle.key}_title`) }}</h3>
              <p>{{ t(`atelier_${principle.key}_desc`) }}</p>
              <span class="principle-path" dir="ltr">{{ principle.path }}</span>
            </div>
            <span :class="[resolveIcon(principle.icon), 'principle-icon']" aria-hidden="true" />
          </li>
        </ol>
      </div>
    </section>

    <HomeWorkflow />

    <ThemeStudio />

    <HomeOwnership />

    <section class="working-section home-container" aria-labelledby="working-title">
      <div class="working-heading">
        <p class="home-eyebrow">{{ t('atelier_working_eyebrow') }}</p>
        <h2 id="working-title" class="home-heading">{{ t('atelier_working_title') }}</h2>
      </div>
      <div class="working-links">
        <RouterLink to="/dashboard/customers"
          ><span>01</span>
          <div>
            <h3>{{ t('atelier_customers_title') }}</h3>
            <p>{{ t('atelier_customers_desc') }}</p>
          </div>
          <span class="working-arrow" aria-hidden="true">↗</span></RouterLink
        >
        <RouterLink to="/docs/components/overview"
          ><span>02</span>
          <div>
            <h3>{{ t('atelier_components_title') }}</h3>
            <p>{{ t('atelier_components_desc') }}</p>
          </div>
          <span class="working-arrow" aria-hidden="true">↗</span></RouterLink
        >
        <RouterLink to="/docs/testing/overview"
          ><span>03</span>
          <div>
            <h3>{{ t('atelier_testing_title') }}</h3>
            <p>{{ t('atelier_testing_desc') }}</p>
          </div>
          <span class="working-arrow" aria-hidden="true">↗</span></RouterLink
        >
      </div>
    </section>

    <HomeQuestions />

    <section class="home-container closing-container" aria-labelledby="closing-title">
      <div class="closing-section">
        <div class="closing-art" aria-hidden="true"><span /><span /><span /></div>
        <div class="closing-copy">
          <p class="home-eyebrow">{{ t('atelier_closing_eyebrow') }}</p>
          <h2 id="closing-title">{{ t('atelier_closing_title') }}</h2>
          <p>{{ t('atelier_closing_desc') }}</p>
          <div class="closing-actions">
            <UiButton
              to="/docs/getting-started/installation"
              variant="ghost"
              size="lg"
              class="closing-install"
              >{{ t('cta_install_button') }} <span aria-hidden="true">↗</span></UiButton
            >
            <a
              href="https://github.com/boussadjra/vuestrata"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('cta_source_button') }} <span aria-hidden="true">↗</span></a
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-experience {
  overflow: clip;
}
:deep(.home-container) {
  width: min(100% - 4rem, 80rem);
  margin-inline: auto;
}
:deep(.home-eyebrow) {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-block-end: 1.3rem;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.6;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-muted-foreground);
}
:deep(.home-heading) {
  font: 400 clamp(2.2rem, 3.5vw, 3.4rem)/1.1 var(--font-display, var(--font-sans));
  letter-spacing: -0.035em;
  text-wrap: balance;
}
:deep(.home-description) {
  max-width: 48ch;
  font-size: 0.9rem;
  line-height: 1.9;
  color: var(--color-muted-foreground);
}
.home-hero {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 3.5rem;
  padding-block: 6.2rem 0;
}
.hero-intro {
  align-self: center;
  padding-block: 0.5rem 2.5rem;
}
.eyebrow-rule {
  width: 2rem;
  height: 1px;
  background: var(--color-primary-solid);
}
h1 {
  font: 400 clamp(3rem, 5.6vw, 5.1rem)/1.02 var(--font-display, var(--font-sans));
  letter-spacing: -0.05em;
  text-wrap: balance;
}
h1 em {
  color: var(--color-link, var(--color-primary-solid));
  font-weight: 400;
}
.hero-description {
  max-width: 40ch;
  margin-block: 1.75rem 2rem;
  color: var(--color-muted-foreground);
  font-size: 0.95rem;
  line-height: 1.9;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.hero-footnote {
  margin-block-start: 1.5rem;
  color: var(--color-muted-foreground);
  font-size: 0.68rem;
}
.hero-visual {
  position: relative;
  align-self: center;
  min-width: 0;
  padding-block: 0.5rem 0;
}
.visual-caption {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem;
  font-size: 0.62rem;
  color: var(--color-muted-foreground);
  letter-spacing: 0.025em;
}
.hero-baseline {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2rem;
  padding-block: 1.65rem;
  border-block-start: 1px solid var(--color-border);
  font-size: 0.68rem;
}
.hero-baseline > span {
  color: var(--color-muted-foreground);
}
.hero-baseline ul {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2.2rem;
  list-style: none;
  font-weight: 600;
}
.foundation-section {
  margin-block-start: 1rem;
  background: var(--color-muted);
  border-block: 1px solid var(--color-border);
}
.foundation-content {
  display: grid;
  grid-template-columns: 0.9fr 1fr;
  align-items: start;
  gap: 6rem;
  padding-block: 5.5rem;
}
.foundation-intro .home-heading {
  max-width: 15ch;
}
.foundation-intro .home-description {
  margin-block-start: 1.5rem;
}
.home-text-link {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  margin-block-start: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-underline-offset: 5px;
}
.home-text-link:hover {
  text-decoration: underline;
}
.principles {
  list-style: none;
}
.principles li {
  display: grid;
  grid-template-columns: 1.6rem 1fr 1.2rem;
  align-items: start;
  gap: 1rem;
  padding-block: 1.65rem;
  border-block-end: 1px solid var(--color-border);
}
.principles li:first-child {
  padding-block-start: 0;
}
.principle-number {
  margin-block-start: 0.4rem;
  color: var(--color-muted-foreground);
  font: 0.65rem var(--font-mono);
}
.principles h3 {
  font-size: 1.05rem;
  font-weight: 600;
}
.principles p {
  max-width: 42ch;
  margin-block-start: 0.6rem;
  color: var(--color-muted-foreground);
  font-size: 0.8rem;
  line-height: 1.8;
}
.principle-path {
  display: inline-block;
  margin-block-start: 1rem;
  color: var(--color-muted-foreground);
  font: 0.6rem/1.7 var(--font-mono);
}
.principle-icon {
  width: 1.1rem;
  height: 1.1rem;
  margin-block-start: 0.3rem;
  color: var(--color-primary-solid);
}
.working-section {
  display: grid;
  grid-template-columns: 0.9fr 1fr;
  gap: 6rem;
  padding-block: 1rem 6rem;
}
.working-heading {
  padding-block-start: 1.5rem;
}
.working-heading h2 {
  max-width: 15ch;
}
.working-links > a {
  display: grid;
  grid-template-columns: 1.5rem 1fr 1rem;
  gap: 1.25rem;
  align-items: center;
  padding-block: 1.6rem;
  border-block-end: 1px solid var(--color-border);
  transition: color 160ms;
}
.working-links > a > span:first-child {
  font: 0.6rem var(--font-mono);
  color: var(--color-muted-foreground);
}
.working-links h3 {
  font-size: 0.95rem;
  font-weight: 600;
}
.working-links p {
  margin-block-start: 0.4rem;
  color: var(--color-muted-foreground);
  font-size: 0.77rem;
  line-height: 1.7;
}
.working-links a:hover h3 {
  color: var(--color-primary-solid);
}
.working-arrow {
  font-size: 1.2rem;
}
.closing-container {
  padding-block-end: 4rem;
}
.closing-section {
  position: relative;
  display: grid;
  grid-template-columns: 0.65fr 1fr;
  align-items: center;
  gap: 4rem;
  overflow: hidden;
  padding: 4rem;
  border-radius: var(--radius-xl);
  background: var(--color-spotlight, var(--color-surface-950));
  color: var(--color-spotlight-foreground, var(--color-surface-50));
}
.closing-section .home-eyebrow {
  color: var(--color-spotlight-muted, var(--color-surface-200));
}
.closing-copy {
  position: relative;
}
.closing-copy h2 {
  max-width: 17ch;
  font: 400 clamp(2.2rem, 3.3vw, 3.6rem)/1.07 var(--font-display, var(--font-sans));
  letter-spacing: -0.03em;
}
.closing-copy > p:not(.home-eyebrow) {
  max-width: 48ch;
  margin-block-start: 1.5rem;
  color: var(--color-spotlight-muted, var(--color-surface-200));
  font-size: 0.85rem;
  line-height: 1.9;
}
.closing-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.75rem;
  margin-block-start: 2rem;
}
.closing-actions > a:last-child {
  font-size: 0.75rem;
  text-underline-offset: 5px;
}
.closing-actions > a:last-child:hover {
  text-decoration: underline;
}
.closing-art {
  position: relative;
  height: 16rem;
  transform: rotate(-16deg);
}
.closing-art > span {
  position: absolute;
  inset: 0 0 2rem;
  border: 1px solid
    color-mix(in oklch, var(--color-spotlight-foreground, var(--color-surface-50)) 35%, transparent);
  border-radius: var(--radius-lg);
  transform: skewY(16deg);
}
.closing-art > span:nth-child(2) {
  inset-block: 3rem -1rem;
}
.closing-art > span:nth-child(3) {
  inset-block: 6rem -4rem;
  border-color: var(--color-spotlight-accent, var(--color-accent-300));
}
[dir='rtl'] .working-arrow {
  transform: scaleX(-1);
}
@media (min-width: 1500px) {
  .home-hero {
    padding-block-start: 7.5rem;
  }
}
@media (max-width: 1000px) {
  .home-hero {
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    padding-block-start: 4rem;
  }
  h1 {
    font-size: 3.8rem;
  }
  .foundation-content,
  .working-section {
    gap: 3rem;
  }
  .closing-section {
    gap: 3rem;
    padding: 3rem;
  }
}
@media (max-width: 800px) {
  :deep(.home-container) {
    width: min(100% - 2.5rem, 40rem);
  }
  .home-hero {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding-block-start: 3rem;
  }
  .hero-intro {
    padding-block-end: 0.5rem;
  }
  h1 {
    font-size: clamp(3.2rem, 9vw, 4.7rem);
  }
  .hero-description {
    max-width: 45ch;
  }
  .hero-visual {
    margin-block-start: 1rem;
  }
  .hero-baseline {
    gap: 0.8rem;
  }
  .hero-baseline ul {
    gap: 0.7rem 1.2rem;
  }
  .foundation-content,
  .working-section {
    grid-template-columns: 1fr;
    gap: 2.5rem;
    padding-block: 3.5rem;
  }
  .foundation-intro .home-heading,
  .working-heading h2 {
    max-width: 20ch;
  }
  .closing-section {
    grid-template-columns: 1fr;
    padding: 2.3rem 1.5rem;
  }
  .closing-art {
    display: none;
  }
  .closing-container {
    padding-block-end: 2rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .working-links > a {
    transition: none;
  }
}
</style>

<style scoped>
.closing-install {
  background: var(--color-spotlight-foreground, var(--color-surface-50));
  color: var(--color-spotlight, var(--color-surface-950));
  border: 1px solid var(--color-spotlight-foreground, var(--color-surface-50));
}
.closing-install:hover {
  background: color-mix(
    in oklch,
    var(--color-spotlight-foreground, var(--color-surface-50)) 90%,
    var(--color-spotlight-accent, var(--color-accent-300))
  );
  color: var(--color-spotlight, var(--color-surface-950));
}
</style>
