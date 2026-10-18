<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const moduleNames = ['products', 'invoices', 'projects'] as const
const selectedModule = ref<(typeof moduleNames)[number]>('products')
const previewId = useId()
const queryFile = computed(
  () =>
    `composables/use${selectedModule.value[0]!.toUpperCase()}${selectedModule.value.slice(1)}.ts`,
)
</script>

<template>
  <section class="workflow home-container" aria-labelledby="workflow-title">
    <div class="workflow-copy">
      <p class="home-eyebrow">{{ t('atelier_workflow_eyebrow') }}</p>
      <h2 id="workflow-title" class="home-heading">{{ t('atelier_workflow_title') }}</h2>
      <p class="home-description">{{ t('atelier_workflow_desc') }}</p>
      <ol class="workflow-steps">
        <li v-for="step in [1, 2, 3]" :key="step">
          <span class="step-number" aria-hidden="true">0{{ step }}</span>
          <div>
            <h3>{{ t(`atelier_workflow_step${step}_title`) }}</h3>
            <p>{{ t(`atelier_workflow_step${step}_desc`) }}</p>
          </div>
        </li>
      </ol>
      <RouterLink to="/docs/recipes/add-a-module" class="workflow-guide">
        {{ t('atelier_workflow_guide') }} <span aria-hidden="true">↗</span>
      </RouterLink>
    </div>

    <div class="workflow-preview">
      <div class="preview-heading">
        <span class="preview-dot" aria-hidden="true" />
        {{ t('atelier_workflow_preview_label') }}
      </div>
      <div class="module-options" role="group" :aria-label="t('atelier_workflow_module_label')">
        <button
          v-for="name in moduleNames"
          :key="name"
          type="button"
          :aria-pressed="selectedModule === name"
          :aria-controls="previewId"
          :class="{ selected: selectedModule === name }"
          @click="selectedModule = name"
        >
          <code>{{ name }}</code>
        </button>
      </div>
      <div :id="previewId" class="module-output" aria-live="polite">
        <div class="terminal-window">
          <p>{{ t('atelier_workflow_terminal_label') }}</p>
          <code dir="ltr"
            ><span aria-hidden="true">$ </span>vp run gen:module
            <strong>{{ selectedModule }}</strong> --dry-run</code
          >
        </div>
        <div class="file-window">
          <p class="file-window-label">{{ t('atelier_workflow_files_label') }}</p>
          <div class="file-root" dir="ltr">
            <span aria-hidden="true">⌁</span> src/modules/<strong>{{ selectedModule }}</strong
            >/
          </div>
          <ul class="file-list" dir="ltr">
            <li><span class="file-mark" aria-hidden="true" />index.ts</li>
            <li><span class="file-mark" aria-hidden="true" />types.ts</li>
            <li><span class="file-mark" aria-hidden="true" />query-keys.ts</li>
            <li><span class="file-mark" aria-hidden="true" />{{ queryFile }}</li>
            <li><span class="file-mark" aria-hidden="true" />i18n/{en,fr,ar}.json</li>
            <li><span class="file-mark" aria-hidden="true" />pages/{index,detail,form}.vue</li>
          </ul>
          <div class="registry-note" dir="ltr">
            <span aria-hidden="true">+</span> setup.ts
            <span aria-hidden="true">·</span> rbac.overrides.ts
          </div>
        </div>
      </div>
      <p class="preview-note">{{ t('atelier_workflow_note') }}</p>
    </div>
  </section>
</template>

<style scoped>
.workflow {
  display: grid;
  grid-template-columns: 0.9fr 1fr;
  align-items: center;
  gap: 6rem;
  padding-block: 6.5rem;
}
.workflow-copy .home-heading {
  max-width: 16ch;
}
.workflow-copy .home-description {
  margin-block-start: 1.5rem;
}
.workflow-steps {
  list-style: none;
  margin-block: 2rem 0;
}
.workflow-steps li {
  position: relative;
  display: grid;
  grid-template-columns: 1.8rem 1fr;
  gap: 1rem;
  padding-block-end: 1.7rem;
}
.workflow-steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  inset-inline-start: 0.63rem;
  inset-block: 1.8rem 0.4rem;
  width: 1px;
  background: var(--color-border);
}
.step-number {
  padding-block-start: 0.15rem;
  font: 0.65rem/1.6 var(--font-mono);
  color: var(--color-link);
}
.workflow-steps h3 {
  font-size: 0.85rem;
  font-weight: 600;
}
.workflow-steps p {
  margin-block-start: 0.45rem;
  font-size: 0.8rem;
  line-height: 1.8;
  color: var(--color-muted-foreground);
}
.workflow-guide {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.78rem;
  font-weight: 600;
  text-underline-offset: 5px;
}
.workflow-guide:hover {
  text-decoration: underline;
}
.workflow-preview {
  min-width: 0;
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}
.preview-heading {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
}
.preview-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--color-link);
}
.module-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-block: 1.25rem;
}
.module-options button {
  min-height: 2.75rem;
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.72rem;
  color: var(--color-muted-foreground);
  background: var(--color-background);
  cursor: pointer;
}
.module-options button.selected {
  color: var(--color-primary-foreground);
  background: var(--color-primary-solid);
  border-color: var(--color-primary-solid);
}
.module-options button:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 3px;
}
.terminal-window {
  padding: 1.3rem;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-spotlight, var(--color-surface-950));
  color: var(--color-spotlight-foreground, var(--color-surface-50));
}
.terminal-window p {
  margin-block-end: 1rem;
  font-size: 0.64rem;
  color: var(--color-spotlight-muted, var(--color-surface-200));
}
.terminal-window code {
  display: block;
  font: 0.75rem/1.9 var(--font-mono);
  overflow-wrap: anywhere;
}
.terminal-window code > span,
.terminal-window strong {
  color: var(--color-spotlight-link, var(--color-accent-300));
  font-weight: 500;
}
.file-window {
  padding: 1.4rem;
  border: 1px solid var(--color-border);
  border-block-start: none;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
.file-window-label {
  margin-block-end: 1rem;
  font-size: 0.65rem;
  color: var(--color-muted-foreground);
}
.file-root {
  overflow-wrap: anywhere;
  font: 0.72rem/1.8 var(--font-mono);
}
.file-root > span {
  margin-inline-end: 0.4rem;
  color: var(--color-link);
}
.file-list {
  display: grid;
  gap: 0.65rem;
  list-style: none;
  margin: 0.9rem 0 1.1rem 0.5rem;
  padding-inline-start: 1rem;
  border-inline-start: 1px solid var(--color-border);
}
.file-list li {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  overflow-wrap: anywhere;
  font: 0.66rem/1.7 var(--font-mono);
  color: var(--color-muted-foreground);
}
.file-mark {
  width: 0.4rem;
  height: 0.5rem;
  flex-shrink: 0;
  border: 1px solid var(--color-border-strong);
}
.registry-note {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--color-border);
  font: 0.65rem/1.8 var(--font-mono);
  color: var(--color-muted-foreground);
}
.registry-note > span:first-child {
  color: var(--color-link);
}
.preview-note {
  margin-block-start: 1.2rem;
  max-width: 58ch;
  font-size: 0.68rem;
  line-height: 1.8;
  color: var(--color-muted-foreground);
}
@media (max-width: 1000px) {
  .workflow {
    gap: 3rem;
  }
}
@media (max-width: 800px) {
  .workflow {
    grid-template-columns: 1fr;
    gap: 2.5rem;
    padding-block: 3.5rem;
  }
  .workflow-copy .home-heading {
    max-width: 21ch;
  }
  .workflow-preview {
    padding: 1rem;
  }
  .file-window,
  .terminal-window {
    padding: 1.1rem;
  }
}
</style>
