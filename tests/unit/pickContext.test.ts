import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, inject, shallowRef } from 'vue'
import type { Book } from '../../shared/types/book'
import { createPickContext, initialInsets, initialMorph, initialPick, PICK_CONTEXT_KEY } from '../../app/utils/books/pickContext'
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

  it('has its own hovered, focused and insets, and resolves no Book without a source', () => {
    const one = createPickContext()
    const two = createPickContext()
    one.hovered.value = 'a'
    one.focused.value = 'b'
    one.insets.value.sheetTop = 120
    expect(two.hovered.value).toBeNull()
    expect(two.focused.value).toBeNull()
    expect(two.insets.value).toEqual(initialInsets())
    expect(one.bookById('a')).toBeNull()
  })

  it('looks Books up by id in its own Library: an array, a ref or a getter', () => {
    const mine = { id: 'same', title: 'Mine' } as Book
    const hers = { id: 'same', title: 'Hers' } as Book
    expect(createPickContext({ books: [hers] }).bookById('same')).toBe(hers)
    expect(createPickContext({ books: [hers] }).bookById('other')).toBeNull()
    const library = shallowRef<Book[]>([mine])
    const context = createPickContext({ books: library })
    expect(context.bookById('same')).toBe(mine)
    library.value = [hers]
    expect(context.bookById('same')).toBe(hers)
    const list = shallowRef<Book[]>([])
    const lazy = createPickContext({ books: () => list.value })
    expect(lazy.bookById('same')).toBeNull()
    list.value = [mine]
    expect(lazy.bookById('same')).toBe(mine)
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
