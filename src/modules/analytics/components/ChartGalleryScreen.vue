<script setup lang="ts">
import { UiButton, UiEmptyState, UiPageHeader, UiSearchField } from '@/components/ui'

import { useChartGallery } from '../composables/useChartGallery'
import ChartGalleryCard from './ChartGalleryCard.vue'

const { dt, search, family, examples, families, context, resetFilters, total } = useChartGallery()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6" data-testid="chart-gallery">
    <UiPageHeader :title="dt('charts_title')" :description="dt('chart_gallery_subtitle')">
      <template #actions>
        <span
          class="border-border bg-card text-foreground rounded-[var(--shape-radius)] border px-3 py-2 text-sm font-semibold tabular-nums"
        >
          {{ dt('chart_gallery_count', { count: total }) }}
        </span>
      </template>
    </UiPageHeader>

    <div class="space-y-4 px-4">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <UiSearchField
          v-model="search"
          name="chart-gallery-search"
          :label="dt('chart_gallery_search')"
          :placeholder="dt('chart_gallery_search_placeholder')"
          :clear-button-label="dt('chart_gallery_clear_search')"
          class="w-full sm:max-w-md"
        />
        <UiButton v-if="search || family !== 'all'" variant="ghost" @click="resetFilters">
          {{ dt('chart_gallery_reset') }}
        </UiButton>
      </div>

      <div class="flex flex-wrap gap-2" role="group" :aria-label="dt('chart_gallery_families')">
        <button
          type="button"
          :aria-pressed="family === 'all'"
          class="btn border-border text-foreground hover:bg-muted min-h-11 cursor-pointer rounded-[var(--shape-radius-sm)] border px-4 py-2 text-sm font-medium transition-colors"
          :class="family === 'all' ? 'bg-muted' : 'bg-transparent'"
          data-ui="button"
          data-variant="ghost"
          data-testid="chart-family-filter"
          data-chart-family="all"
          @click="family = 'all'"
        >
          {{ dt('chart_gallery_all') }}
          <span class="text-muted-foreground ms-2 tabular-nums">{{ total }}</span>
        </button>
        <button
          v-for="item in families"
          :key="item.id"
          type="button"
          :aria-pressed="family === item.id"
          class="btn border-border text-foreground hover:bg-muted min-h-11 cursor-pointer rounded-[var(--shape-radius-sm)] border px-4 py-2 text-sm font-medium transition-colors"
          :class="family === item.id ? 'bg-muted' : 'bg-transparent'"
          data-ui="button"
          data-variant="ghost"
          data-testid="chart-family-filter"
          :data-chart-family="item.id"
          @click="family = item.id"
        >
          {{ dt(`chart_gallery_family_${item.id}`) }}
          <span class="text-muted-foreground ms-2 tabular-nums">{{ item.count }}</span>
        </button>
      </div>

      <p
        class="text-muted-foreground text-sm tabular-nums"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ dt('chart_gallery_results', { count: examples.length }) }}
      </p>
    </div>

    <div v-if="examples.length" class="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <ChartGalleryCard
        v-for="example in examples"
        :key="example.id"
        :example="example"
        :context="context"
      />
    </div>
    <UiEmptyState
      v-else
      icon="graph"
      :title="dt('chart_gallery_empty_title')"
      :description="dt('chart_gallery_empty_description')"
    >
      <template #action>
        <UiButton variant="ghost" @click="resetFilters">{{ dt('chart_gallery_reset') }}</UiButton>
      </template>
    </UiEmptyState>
  </div>
</template>
