<script setup lang="ts">
import rawMarkdown from '/docs/5.components/2.forms/6.form-builder.md?raw'
import { Comark } from 'comark/vue'

import { docsComarkComponents, docsComarkPlugins } from '@/config/comark'

function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  return match ? match[1]! : raw
}

const markdown = stripFrontmatter(rawMarkdown)
</script>

<template>
  <article class="docs-content mx-auto max-w-5xl py-2">
    <Comark :markdown="markdown" :components="docsComarkComponents" :plugins="docsComarkPlugins" />
  </article>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
