import githubDark from '@shikijs/themes/github-dark'
import githubLight from '@shikijs/themes/github-light'
import highlight from 'comark/plugins/highlight'
import security from 'comark/plugins/security'
import summary from 'comark/plugins/summary'
import taskList from 'comark/plugins/task-list'
import toc from 'comark/plugins/toc'

import DocsAlert from '@/components/docs/DocsAlert.vue'
import DocsCard from '@/components/docs/DocsCard.vue'
import DocsCardGroup from '@/components/docs/DocsCardGroup.vue'
import DocsCodeGroup from '@/components/docs/DocsCodeGroup.vue'
import DocsComponentShowcase from '@/components/docs/DocsComponentShowcase.vue'
import DocsMermaid from '@/components/docs/DocsMermaid.vue'
import jsonRender from '@/config/comark-json-render'
import mermaid from '@/config/comark-mermaid'

export const docsComarkPlugins = [
  taskList(),
  mermaid(),
  summary(),
  toc({ depth: 3, searchDepth: 3, title: 'On This Page' }),
  jsonRender(),
  highlight({
    themes: {
      light: githubLight,
      dark: githubDark,
    },
  }),
  security({
    blockedTags: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'base', 'meta'],
    allowedProtocols: ['http', 'https', 'mailto', 'tel'],
    allowDataImages: false,
  }),
]

export const docsComarkComponents = {
  alert: DocsAlert,
  card: DocsCard,
  'card-group': DocsCardGroup,
  'component-showcase': DocsComponentShowcase,
  'code-group': DocsCodeGroup,
  mermaid: DocsMermaid,
}
