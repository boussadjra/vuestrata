import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'

import UiButton from '@/components/ui/UiButton.vue'

/**
 * Overriding a `Ui*` wrapper's styling from the call site.
 *
 * This is the escape hatch that keeps a project out of the component file, and
 * a component nobody edits is one `vuestrata upgrade` can keep updating.
 */
describe('UiButton class merging', () => {
  it('lets a caller replace a utility rather than merely append to it', () => {
    const wrapper = mount(UiButton, {
      props: { size: 'md' },
      attrs: { class: 'px-10' },
      slots: { default: 'Save' },
    })

    const classes = wrapper.attributes('class') ?? ''

    // `px-4` is removed, not out-ordered. Both present would leave the winner
    // to whichever order Tailwind emitted them into the stylesheet.
    expect(classes).toContain('px-10')
    expect(classes).not.toContain('px-4')
  })

  it('keeps the classes the caller did not conflict with', () => {
    const wrapper = mount(UiButton, {
      attrs: { class: 'px-10' },
      slots: { default: 'Save' },
    })

    const classes = wrapper.attributes('class') ?? ''
    expect(classes).toContain('inline-flex')
    expect(classes).toContain('font-medium')
  })

  it('still forwards attributes that are not class', () => {
    // `inheritAttrs: false` makes forwarding manual, which is how an id gets
    // silently dropped.
    const wrapper = mount(UiButton, {
      attrs: { id: 'save-button', 'data-testid': 'save' },
      slots: { default: 'Save' },
    })

    expect(wrapper.attributes('id')).toBe('save-button')
    expect(wrapper.attributes('data-testid')).toBe('save')
  })
})
