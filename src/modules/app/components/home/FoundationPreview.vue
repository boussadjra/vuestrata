<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { foundationSnippets, type FoundationLayer } from './snippets'

const { t } = useI18n()
const activeLayer = ref<FoundationLayer>('feature')
const layers = ['page', 'feature', 'core'] as const
const previewId = useId()
</script>

<template>
  <div class="foundation-preview">
    <div class="preview-topline">
      <svg class="preview-mark" viewBox="0 0 90 143" aria-hidden="true">
        <path d="M0 30 90 0v23L0 53Z M0 75 90 45v23L0 98Z M0 120 90 90v23L0 143Z" fill="#cf4c18" />
      </svg>
      <span>vuestrata / {{ t('atelier_preview_label') }}</span>
      <span class="preview-example">{{ t('atelier_example') }}</span>
    </div>
    <div class="preview-workspace">
      <div class="preview-rail" role="group" :aria-label="t('atelier_layers_label')">
        <button
          v-for="(layer, index) in layers"
          :key="layer"
          type="button"
          :aria-pressed="activeLayer === layer"
          :aria-controls="previewId"
          :class="{ 'is-active': activeLayer === layer }"
          @click="activeLayer = layer"
        >
          <span class="layer-number">0{{ index + 1 }}</span>
          <span>{{ t(`atelier_layer_${layer}`) }}</span>
          <span class="layer-arrow" aria-hidden="true">↗</span>
        </button>
        <div class="rail-caption">{{ t('atelier_preview_direction') }}</div>
      </div>
      <div :id="previewId" class="preview-editor" aria-live="polite">
        <div class="editor-filename">
          <span aria-hidden="true">◇</span>
          <span class="editor-path" dir="ltr">{{
            foundationSnippets[activeLayer].sourcePath
          }}</span>
        </div>
        <pre
          dir="ltr"
          role="region"
          tabindex="0"
          :aria-label="t('atelier_preview_label')"
        ><code><span v-for="(line, index) in foundationSnippets[activeLayer].lines" :key="`${activeLayer}-${index}`" class="code-line"><span class="line-number" aria-hidden="true">{{ foundationSnippets[activeLayer].startLine + index }}</span><span v-for="(part, tokenIndex) in line" :key="tokenIndex" class="syntax-token" :data-kind="part.kind">{{ part.text }}</span>{{ '\n' }}</span></code></pre>
        <p class="editor-description">{{ t(`atelier_layer_${activeLayer}_desc`) }}</p>
      </div>
    </div>
    <div class="preview-footer">
      <span
        ><span class="contract-dot" aria-hidden="true" /> {{ t('atelier_preview_contract') }}</span
      >
      <span>Vue · TypeScript · Vite+</span>
    </div>
  </div>
</template>

<style scoped>
.foundation-preview {
  --preview-bg: var(--color-spotlight, var(--color-surface-950));
  --preview-ink: var(--color-spotlight-foreground, var(--color-surface-50));
  --preview-muted: var(--color-spotlight-muted, var(--color-surface-200));
  --preview-accent: var(--color-spotlight-accent, var(--color-accent-300));
  position: relative;
  overflow: hidden;
  color: var(--preview-ink);
  background: var(--preview-bg);
  border: 1px solid color-mix(in oklch, var(--preview-ink) 18%, transparent);
  border-radius: var(--radius-xl);
  box-shadow: 0 28px 65px -35px color-mix(in oklch, var(--preview-bg) 50%, transparent);
}
.preview-topline,
.preview-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.15rem 1.4rem;
  font-size: 0.68rem;
}
.preview-topline {
  border-block-end: 1px solid color-mix(in oklch, var(--preview-ink) 16%, transparent);
  letter-spacing: 0.04em;
}
.preview-mark {
  flex: none;
  width: auto;
  height: 22px;
}
.preview-example {
  margin-inline-start: auto;
  color: var(--preview-muted);
}
.preview-workspace {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  min-height: 22rem;
}
.preview-rail {
  padding-block: 1.75rem;
  border-inline-end: 1px solid color-mix(in oklch, var(--preview-ink) 16%, transparent);
}
.preview-rail button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3.15rem;
  padding-inline: 1rem;
  color: var(--preview-muted);
  cursor: pointer;
  font-size: 0.75rem;
  text-align: start;
  transition:
    background 160ms,
    color 160ms;
}
.preview-rail button:hover,
.preview-rail button.is-active {
  background: color-mix(in oklch, var(--preview-ink) 10%, transparent);
  color: var(--preview-ink);
}
.preview-rail button.is-active .layer-number {
  color: var(--preview-accent);
}
.layer-number {
  font: 0.6rem var(--font-mono);
}
.layer-arrow {
  margin-inline-start: auto;
}
.rail-caption {
  margin: 3.8rem 1rem 0;
  max-width: 12ch;
  font-size: 0.65rem;
  line-height: 1.7;
  color: var(--preview-muted);
}
.preview-editor {
  min-width: 0;
  padding: 1.85rem 1.4rem;
}
.editor-filename {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.75rem;
}
.editor-filename > span:first-child {
  color: var(--preview-accent);
  font-size: 1.1rem;
}
.editor-path {
  min-width: 0;
  overflow: hidden;
  font: 0.65rem var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
pre {
  overflow-x: auto;
  margin-block: 1.75rem;
  font: 0.72rem/1.9 var(--font-mono);
  color: var(--preview-ink);
  direction: ltr;
  text-align: left;
  unicode-bidi: isolate;
}
.code-line {
  white-space: pre;
}
.syntax-token[data-kind='comment'] {
  color: var(--code-comment, var(--preview-muted));
}
.syntax-token[data-kind='keyword'],
.syntax-token[data-kind='attribute'] {
  color: var(--code-keyword, var(--color-accent-200));
}
.syntax-token[data-kind='string'] {
  color: var(--code-string, var(--color-success-200));
}
.syntax-token[data-kind='function'],
.syntax-token[data-kind='tag'] {
  color: var(--code-function, var(--color-info-200));
}
.syntax-token[data-kind='type'] {
  color: var(--code-type, var(--color-warning-200));
}
.syntax-token[data-kind='operator'] {
  color: var(--code-operator, var(--preview-ink));
}
.line-number {
  display: inline-block;
  width: 1.9rem;
  color: var(--preview-muted);
  user-select: none;
}
.editor-description {
  max-width: 32ch;
  font-size: 0.75rem;
  line-height: 1.7;
  color: var(--preview-muted);
}
.preview-footer {
  justify-content: space-between;
  flex-wrap: wrap;
  border-block-start: 1px solid color-mix(in oklch, var(--preview-ink) 16%, transparent);
  color: var(--preview-muted);
  font-size: 0.6rem;
}
.preview-footer > span:first-child {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.contract-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--preview-accent);
}
@media (max-width: 550px) {
  .preview-workspace {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .preview-rail {
    display: flex;
    padding: 0.4rem;
    border-inline-end: 0;
    border-block-end: 1px solid color-mix(in oklch, var(--preview-ink) 16%, transparent);
  }
  .preview-rail button {
    justify-content: center;
    padding-inline: 0.5rem;
  }
  .layer-arrow,
  .rail-caption {
    display: none;
  }
  .preview-editor {
    padding: 1.5rem 1.15rem;
  }
  pre {
    font-size: 0.68rem;
    margin-block: 1.25rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .preview-rail button {
    transition: none;
  }
}
</style>
