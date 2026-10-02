import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

import DocsContent from '@/components/docs/DocsContent.vue'
import {
  showsDocHeader,
  stripLeadingHeading,
  type DocEntry,
} from '@/components/docs/docsNavigation'
import { installI18n } from '@/plugins/i18n'

/**
 * A docs page has one `<h1>`.
 *
 * The header above the content shows the page title, and the content used to
 * bring a second: the `# Title` every markdown page opens with, or the heading
 * of a component demo page. A strict locator for the page's heading then
 * matched two elements as soon as the markdown had rendered, which is how this
 * was found (e2e/navigation.spec.ts).
 */

// The markdown pipeline (Comark, its plugins, the highlighter) is not what is
// under test, and loading it costs more than the rest of this file.
vi.mock('@/config/comark', () => ({ docsComarkComponents: {}, docsComarkPlugins: [] }))
vi.mock('comark/vue', () => ({ Comark: { render: () => null } }))

const doc = (overrides: Partial<DocEntry> = {}): DocEntry => ({
  slug: 'components/forms/form-builder',
  title: 'Form Builder',
  description: 'Forms defined as data.',
  content: '',
  order: 6,
  section: 'components',
  sectionOrder: 5,
  ...overrides,
})

function mountContent(entry: DocEntry) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(DocsContent, {
    props: { doc: entry },
    global: { plugins: [pinia, installI18n] },
  })
}

describe('stripLeadingHeading', () => {
  it('removes the title a page opens with, and the blank lines under it', () => {
    expect(stripLeadingHeading('# Form Builder\n\nUse Form Builder when…\n')).toBe(
      'Use Form Builder when…\n',
    )
    expect(stripLeadingHeading('\n# Form Builder\nBody\n')).toBe('Body\n')
    expect(stripLeadingHeading('# Only a title')).toBe('')
  })

  it('leaves every other heading, and a `#` that is not one', () => {
    const body = 'Intro.\n\n# Later\n\n```bash\n# a comment\n```\n'
    expect(stripLeadingHeading(body)).toBe(body)
    expect(stripLeadingHeading('## Section\n\nText\n')).toBe('## Section\n\nText\n')
    expect(stripLeadingHeading('#hashtag first\n')).toBe('#hashtag first\n')
  })

  it('removes one heading, not a run of them', () => {
    expect(stripLeadingHeading('# Title\n\n# Second\n')).toBe('# Second\n')
  })
})

describe('showsDocHeader', () => {
  it('is true for a doc with a section or a description, as the header itself decides', () => {
    expect(showsDocHeader({ description: 'About', section: '' })).toBe(true)
    expect(showsDocHeader({ description: '', section: 'components' })).toBe(true)
    expect(showsDocHeader({ description: '', section: '' })).toBe(false)
  })
})

describe('DocsContent', () => {
  it('shows the title as the page heading for a markdown page', () => {
    const wrapper = mountContent(doc())

    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.text()).toBe('Form Builder')
  })

  it('leaves the heading to content that brings its own', async () => {
    const Demo = defineComponent({
      render: () => h('div', [h('h1', 'Accordion'), h('p', 'Collapsible sections.')]),
    })
    const wrapper = mountContent(doc({ title: 'Accordion', component: Demo, ownHeading: true }))
    await vi.dynamicImportSettled()

    // The title is still shown in the header, as text.
    expect(wrapper.find('section p').text()).toBe('Accordion')
    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.element.closest('article')).not.toBeNull()
  })

  it('renders no header, and so no heading of its own, for a doc without section or description', () => {
    const wrapper = mountContent(doc({ section: '', description: '' }))

    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.findAll('h1')).toHaveLength(0)
  })
})
