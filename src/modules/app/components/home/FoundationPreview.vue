<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { AppIcon } from '@/components/ui'

import { foundationSnippets, type FoundationLayer } from './snippets'

const { t } = useI18n()
const activeLayer = ref<FoundationLayer>('feature')
const layers = ['page', 'feature', 'core'] as const
const previewId = useId()
// An illustrative reference screen, not live customer data or a second data source.
const accounts = [
  { company: 'Northwind Logistics', initials: 'NL', id: 'CUS-1001', plan: 'growth' },
  { company: 'Meridian Health', initials: 'MH', id: 'CUS-1002', plan: 'scale' },
  { company: 'Kestrel Analytics', initials: 'KA', id: 'CUS-1003', plan: 'starter' },
] as const
const sourceName = computed(() =>
  foundationSnippets[activeLayer.value].sourcePath.split('/').at(-1),
)
</script>

<template>
  <div class="foundation-preview">
    <div class="preview-workspace" :aria-label="t('atelier_workspace_label')" role="group">
      <div class="workspace-rail" aria-hidden="true">
        <svg class="workspace-mark" viewBox="0 0 90 143">
          <path
            d="M0 30 90 0v23L0 53Z M0 75 90 45v23L0 98Z M0 120 90 90v23L0 143Z"
            fill="#cf4c18"
          />
        </svg>
        <AppIcon name="widget" />
        <span class="workspace-current"><AppIcon name="users" /></span>
        <AppIcon name="document" />
        <AppIcon name="settings" class="workspace-settings" />
      </div>
      <div class="workspace-content">
        <div class="workspace-topline">
          <span>Vuestrata</span>
          <span class="workspace-example">{{ t('atelier_workspace_example') }}</span>
        </div>
        <p class="workspace-title">{{ t('atelier_workspace_title') }}</p>
        <table class="workspace-table">
          <caption class="workspace-note">
            {{
              t('atelier_workspace_note')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ t('atelier_workspace_company') }}</th>
              <th scope="col">{{ t('atelier_workspace_plan') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in accounts" :key="account.id">
              <td>
                <div class="workspace-account">
                  <span class="account-initials" aria-hidden="true">{{ account.initials }}</span>
                  <span class="account-name">
                    <span dir="ltr">{{ account.company }}</span>
                    <span class="account-id" dir="ltr">{{ account.id }}</span>
                  </span>
                </div>
              </td>
              <td class="account-plan">{{ t('atelier_workspace_' + account.plan) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="preview-layers" role="group" :aria-label="t('atelier_layers_label')">
      <button
        v-for="(layer, index) in layers"
        :key="layer"
        type="button"
        :aria-pressed="activeLayer === layer"
        :aria-controls="previewId"
        :class="{ 'is-active': activeLayer === layer }"
        @click="activeLayer = layer"
      >
        <span class="layer-number home-number">0{{ index + 1 }}</span>
        <span>{{ t('atelier_layer_' + layer) }}</span>
      </button>
    </div>

    <div :id="previewId" class="source-detail">
      <div class="source-heading">
        <span class="source-label"
          ><AppIcon name="code" size="sm" />{{ t('atelier_preview_label') }}</span
        >
        <span class="source-filename" dir="ltr">{{ sourceName }}</span>
      </div>
      <pre
        dir="ltr"
        role="region"
        tabindex="0"
        :aria-label="t('atelier_preview_label')"
      ><code><span v-for="(line, index) in foundationSnippets[activeLayer].lines" :key="activeLayer + '-' + index" class="code-line"><span v-for="(part, tokenIndex) in line" :key="tokenIndex" class="syntax-token" :data-kind="part.kind">{{ part.text }}</span>{{ '\n' }}</span></code></pre>
      <p class="source-description" aria-live="polite">
        {{ t('atelier_layer_' + activeLayer + '_desc') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.foundation-preview {
  min-inline-size: 0;
  color: var(--color-foreground);
}
.preview-workspace {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--color-border-strong, var(--color-border));
  border-radius: var(--radius-lg);
  background: var(--color-card);
}
.workspace-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding-block: 1.5rem;
  border-inline-end: 1px solid var(--color-border);
  background: var(--color-muted);
  color: var(--color-muted-foreground);
}
.workspace-mark {
  inline-size: 0.9rem;
  block-size: 1.5rem;
  margin-block-end: 0.75rem;
}
.workspace-current {
  display: grid;
  place-items: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  border-radius: var(--radius-md);
  background: var(--color-primary-solid);
  color: var(--color-primary-foreground);
}
.workspace-settings {
  margin-block-start: auto;
}
.workspace-content {
  min-inline-size: 0;
  padding: 1.5rem 1.75rem 1.25rem;
}
.workspace-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
}
.workspace-topline > span:first-child {
  font-weight: 600;
}
.workspace-example {
  font-size: 0.75rem;
}
.workspace-title {
  margin-block: 1.5rem 1.25rem;
  font-size: 1.6rem;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.workspace-table {
  inline-size: 100%;
  border-collapse: collapse;
  text-align: start;
}
.workspace-table th {
  padding-block: 0 0.75rem;
  border-block-end: 1px solid var(--color-border);
  color: var(--color-muted-foreground);
  text-align: start;
  font-size: 0.75rem;
  font-weight: 500;
}
.workspace-table td {
  padding-block: 1rem;
  border-block-end: 1px solid var(--color-border);
}
.workspace-table th:last-child,
.workspace-table td:last-child {
  padding-inline-start: 1rem;
  text-align: end;
}
.workspace-account {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.account-initials {
  display: grid;
  place-items: center;
  flex: none;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-muted);
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  font-weight: 600;
}
.workspace-table tr:first-child .account-initials {
  background: var(--color-primary-solid);
  border-color: var(--color-primary-solid);
  color: var(--color-primary-foreground);
}
.account-name {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
}
.account-id {
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  font-weight: 400;
}
.account-plan {
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
}
.workspace-note {
  caption-side: bottom;
  padding-block-start: 1rem;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  text-align: start;
}
.preview-layers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-block-start: 1.25rem;
  border-block-end: 1px solid var(--color-border);
}
.preview-layers button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-inline-size: 0;
  min-block-size: 3.5rem;
  padding: 0.5rem;
  border-block-end: 2px solid transparent;
  color: var(--color-muted-foreground);
  text-align: start;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 160ms,
    border-color 160ms;
}
.preview-layers button:hover,
.preview-layers button.is-active {
  color: var(--color-foreground);
}
.preview-layers button.is-active {
  border-block-end-color: var(--color-primary-solid);
}
.layer-number {
  --number-size: 1.5rem;
  --number-background: var(--color-muted);
  --number-foreground: var(--color-muted-foreground);
  --number-border: var(--color-border);
}
.is-active .layer-number {
  --number-background: var(--color-primary-solid);
  --number-foreground: var(--color-primary-foreground);
  --number-border: var(--color-primary-solid);
}
.source-detail {
  min-inline-size: 0;
  padding-block-start: 1.25rem;
}
.source-heading,
.source-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.source-heading {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
}
.source-filename {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}
pre {
  margin-block: 0.9rem 0.75rem;
  font: 0.75rem/1.8 var(--font-mono);
  color: var(--color-foreground);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  direction: ltr;
  text-align: start;
  unicode-bidi: isolate;
}
.code-line {
  white-space: inherit;
}
.syntax-token[data-kind='comment'] {
  color: var(--color-muted-foreground);
}
.syntax-token[data-kind='keyword'],
.syntax-token[data-kind='attribute'] {
  color: var(--color-link);
}
.syntax-token[data-kind='string'],
.syntax-token[data-kind='operator'] {
  color: var(--color-success);
}
.syntax-token[data-kind='function'],
.syntax-token[data-kind='tag'] {
  color: var(--color-info);
}
.syntax-token[data-kind='type'] {
  color: var(--color-warning);
}
.source-description {
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.7;
}
@media (max-width: 550px) {
  .preview-workspace {
    grid-template-columns: 2.75rem minmax(0, 1fr);
  }
  .workspace-rail {
    gap: 1.25rem;
    padding-block: 1.25rem;
  }
  .workspace-content {
    padding: 1.25rem 1rem 1rem;
  }
  .workspace-title {
    font-size: 1.4rem;
  }
  .workspace-example,
  .account-initials {
    display: none;
  }
  .workspace-table th:last-child,
  .workspace-table td:last-child {
    padding-inline-start: 0.5rem;
  }
  .preview-layers button {
    justify-content: center;
    flex-direction: column;
    min-block-size: 4.5rem;
    gap: 0.4rem;
    font-size: 0.8125rem;
    padding-inline: 0.25rem;
  }
  .preview-layers button > span:last-child {
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    text-align: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .preview-layers button {
    transition: none;
  }
}
</style>
