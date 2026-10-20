import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, nextTick, ref } from 'vue'

import { UiForm, UiSelect } from '@/components/ui'

enableAutoUnmount(afterEach)

const options = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
]

describe('controlled UiSelect ownership', () => {
  it('keeps the committed selection and form value when a parent refuses a choice', async () => {
    const attempted = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiForm,
            { initialValues: { status: 'all' } },
            {
              default: () =>
                h(UiSelect, {
                  name: 'status',
                  label: 'Status',
                  options,
                  modelValue: 'all',
                  'onUpdate:modelValue': attempted,
                }),
            },
          ),
      }),
    )
    const trigger = wrapper.get('[data-ui="select"]').element
    const form = wrapper.getComponent({ name: 'UiForm' }).vm as unknown as {
      values: Record<string, unknown>
      isDirty: () => boolean
    }
    wrapper.getComponent({ name: 'SelectRoot' }).vm.$emit('update:modelValue', 'active')
    await nextTick()

    expect(attempted).toHaveBeenCalledWith('active')
    expect(wrapper.get('[data-ui="select"]').text()).toContain('All')
    expect(wrapper.getComponent({ name: 'SelectRoot' }).props('modelValue')).toBe('all')
    expect(form.values.status).toBe('all')
    expect(form.isDirty()).toBe(false)
    expect(wrapper.get('[data-ui="select"]').element).toBe(trigger)
  })

  it('treats an explicit undefined as a controlled empty value after asynchronous refusal', async () => {
    let finish!: () => void
    const decision = new Promise<void>((resolve) => {
      finish = resolve
    })
    const attempted = vi.fn(async () => {
      await decision
    })
    const wrapper = mount(UiSelect, {
      props: {
        options,
        modelValue: undefined,
        placeholder: 'Choose status',
        'onUpdate:modelValue': attempted,
      },
    })
    wrapper.getComponent({ name: 'SelectRoot' }).vm.$emit('update:modelValue', 'active')
    await nextTick()
    expect(wrapper.get('[data-ui="select"]').text()).toContain('Choose status')
    finish()
    await flushPromises()

    expect(attempted).toHaveBeenCalledWith('active')
    expect(wrapper.getComponent({ name: 'SelectRoot' }).props('modelValue')).toBe('')
    expect(wrapper.get('[data-ui="select"]').text()).not.toContain('Active')
  })

  it('updates named form state when the parent commits or clears a selection', async () => {
    const committed = ref<string | undefined>('all')
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiForm,
            { initialValues: { status: 'all' } },
            {
              default: () =>
                h(UiSelect, {
                  name: 'status',
                  options,
                  modelValue: committed.value,
                  'onUpdate:modelValue': (value: string | number | Array<string | number>) => {
                    committed.value = String(value)
                  },
                }),
            },
          ),
      }),
    )
    const form = wrapper.getComponent({ name: 'UiForm' }).vm as unknown as {
      values: Record<string, unknown>
    }
    wrapper.getComponent({ name: 'SelectRoot' }).vm.$emit('update:modelValue', 'active')
    await nextTick()
    expect(wrapper.get('[data-ui="select"]').text()).toContain('Active')
    expect(form.values.status).toBe('active')

    committed.value = undefined
    await nextTick()
    expect(wrapper.getComponent({ name: 'SelectRoot' }).props('modelValue')).toBe('')
    expect(form.values.status).toBe('')
  })

  it('keeps a refused multi-selection empty and allows omitted models to use form state', async () => {
    const multiple = mount(UiSelect, { props: { options, multiple: true, modelValue: [] } })
    multiple.getComponent({ name: 'SelectRoot' }).vm.$emit('update:modelValue', ['active'])
    await nextTick()
    expect(multiple.getComponent({ name: 'SelectRoot' }).props('modelValue')).toEqual([])

    const uncontrolled = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiForm,
            { initialValues: { status: 'all' } },
            {
              default: () => h(UiSelect, { name: 'status', options }),
            },
          ),
      }),
    )
    expect(uncontrolled.get('[data-ui="select"]').text()).toContain('All')
    uncontrolled.getComponent({ name: 'SelectRoot' }).vm.$emit('update:modelValue', 'active')
    await nextTick()
    const form = uncontrolled.getComponent({ name: 'UiForm' }).vm as unknown as {
      values: Record<string, unknown>
    }
    expect(uncontrolled.get('[data-ui="select"]').text()).toContain('Active')
    expect(form.values.status).toBe('active')
  })
})
