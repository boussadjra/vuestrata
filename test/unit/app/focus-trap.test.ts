import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { defineComponent, h, ref } from 'vue'

import { useFocusTrap } from '@/composables/useFocusTrap'

/**
 * A modal that does not trap focus lets Tab walk into the page behind it. A
 * sighted user sees the overlay and knows the page is blocked; a keyboard-only
 * or screen-reader user ends up operating controls they cannot see, with no way
 * back (WCAG 2.4.3, 2.1.2).
 *
 * jsdom does not implement native Tab navigation, so these tests drive the
 * keydown handler directly — which is exactly the code path the composable
 * owns. Real Tab behaviour is covered in `e2e/rtl-and-keyboard.spec.ts`.
 */

const Harness = defineComponent({
  setup(_, { expose }) {
    const container = ref<HTMLElement | null>(null)
    const trap = useFocusTrap(container)
    expose(trap)
    return () =>
      h('div', {}, [
        h('button', { id: 'outside-before' }, 'before'),
        h('div', { ref: container, tabindex: -1 }, [
          h('button', { id: 'first' }, 'first'),
          h('a', { id: 'middle', href: '#x' }, 'middle'),
          h('button', { id: 'last' }, 'last'),
        ]),
        h('button', { id: 'outside-after' }, 'after'),
      ])
  },
})

type TrapApi = ReturnType<typeof useFocusTrap>

/**
 * `expose()` is invisible to the component's public type, so the exposed trap
 * API has to be re-attached here. Casting the whole vm would hide genuine
 * mistakes; this keeps the trap surface itself type-checked.
 */
function mountHarness() {
  const wrapper = mount(Harness, { attachTo: document.body })
  return wrapper as typeof wrapper & { vm: TrapApi }
}

function pressTab(shiftKey = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useFocusTrap', () => {
  it('focuses the first focusable element on activate', async () => {
    const wrapper = mountHarness()

    await wrapper.vm.activate()

    expect(document.activeElement?.id).toBe('first')
  })

  it('wraps forward from the last element back to the first', async () => {
    const wrapper = mountHarness()
    await wrapper.vm.activate()

    document.getElementById('last')!.focus()
    pressTab()

    expect(document.activeElement?.id).toBe('first')
  })

  it('wraps backward from the first element to the last', async () => {
    const wrapper = mountHarness()
    await wrapper.vm.activate()

    document.getElementById('first')!.focus()
    pressTab(true)

    expect(document.activeElement?.id).toBe('last')
  })

  it('pulls focus back in when it is outside the container', async () => {
    const wrapper = mountHarness()
    await wrapper.vm.activate()

    document.getElementById('outside-before')!.focus()
    pressTab(true)

    expect(document.activeElement?.id).toBe('last')
  })

  it('does nothing while inactive', async () => {
    const wrapper = mountHarness()

    document.getElementById('outside-after')!.focus()
    pressTab()

    // No trapping: focus is left exactly where the browser would put it.
    expect(document.activeElement?.id).toBe('outside-after')
    expect(wrapper.vm.isActive).toBe(false)
  })

  it('restores focus to the previously focused element on deactivate', async () => {
    const wrapper = mountHarness()
    const opener = document.getElementById('outside-before')!
    opener.focus()

    await wrapper.vm.activate()
    expect(document.activeElement?.id).toBe('first')

    wrapper.vm.deactivate()

    // Without this the user loses their place: focus falls back to <body>.
    expect(document.activeElement?.id).toBe('outside-before')
  })

  it('is idempotent — activating twice does not lose the original focus owner', async () => {
    const wrapper = mountHarness()
    const opener = document.getElementById('outside-before')!
    opener.focus()

    await wrapper.vm.activate()
    await wrapper.vm.activate()
    wrapper.vm.deactivate()

    expect(document.activeElement?.id).toBe('outside-before')
  })
})
