import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, inject } from 'vue'
import { createPickContext, initialMorph, initialPick, PICK_CONTEXT_KEY } from '../../app/utils/books/pickContext'
import { SHELVED } from '../../app/utils/books/pick'

describe('createPickContext', () => {
  it('starts with nothing out, the morph idle and no registered listeners or elements', () => {
    const context = createPickContext()
    expect(context.state.value).toEqual(SHELVED)
    expect(context.morph.value).toEqual(initialMorph())
    expect(context.beforeChange.size + context.labelSources.size + context.cardSources.size).toBe(0)
  })

  it('does not share anything between two contexts', () => {
    const one = createPickContext()
    const two = createPickContext()
    one.state.value = { bookId: 'a', face: 'back' }
    one.morph.value.active = true
    one.beforeChange.add(() => {})
    one.labelSources.add({ kind: 'hover', read: () => null })
    one.cardSources.add(() => null)
    expect(two.state.value).toEqual(SHELVED)
    expect(two.morph.value.active).toBe(false)
    expect(two.beforeChange.size + two.labelSources.size + two.cardSources.size).toBe(0)
  })

  it('does not mutate the frozen SHELVED constant', () => {
    const context = createPickContext()
    expect(context.state.value).not.toBe(SHELVED)
    expect(initialPick()).not.toBe(SHELVED)
  })

  it('is what inject finds below a provider, and nothing without one', () => {
    const provided = createPickContext()
    const Probe = defineComponent({ render: () => h('i') })
    const host = createApp(Probe)
    host.provide(PICK_CONTEXT_KEY, provided)
    expect(host.runWithContext(() => inject(PICK_CONTEXT_KEY, null))).toBe(provided)
    expect(createApp(Probe).runWithContext(() => inject(PICK_CONTEXT_KEY, null))).toBeNull()
  })
})
