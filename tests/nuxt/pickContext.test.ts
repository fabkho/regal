// The Pick context (utils/books/pickContext.ts, composables/useBookPick.ts):
// without a provider every view uses the shared global Pick; below a provider
// the views get a Pick of their own, isolated from the shared one.
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { BooksDetails, BooksLabelMorph } from '#components'
import { useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import type { PickContext } from '#layers/regal/app/utils/books/pickContext'
import { createPickContext } from '#layers/regal/app/utils/books/pickContext'
import { onBeforePickChange, providePickContext, useBookPick, useHoveredBook, usePickContext, useSharedPickContext } from '#layers/regal/app/composables/useBookPick'
import { useInspectInsets } from '#layers/regal/app/composables/useInspectInsets'
import { useFocusedBook } from '#layers/regal/app/composables/useScrollHighlight'
import { useLabelMorph, useLabelMorphCard, useLabelMorphLabel } from '#layers/regal/app/composables/useLabelMorph'

const book = (id: string, title: string): Book => ({
  id,
  title,
  seriesTitle: null,
  author: 'Ada Example',
  additionalAuthors: [],
  isbn10: null,
  isbn13: null,
  pages: 200,
  binding: 'Paperback',
  yearPublished: 2020,
  originalYear: 2020,
  rating: 4,
  status: 'read',
  tags: [],
  dateRead: '2025-03-01',
  dateAdded: '2025-01-01',
  review: null,
  reviewHasSpoiler: false,
  readCount: 1,
  description: null,
})

// The same id in the shared Library and in the reel's: her edition's id can equal yours.
const MINE = book('same-id', 'Your Copy')
const HERS = book('same-id', 'Her Copy')
const ONLY_HERS = book('only-hers', 'Her Own Book')

type Api = ReturnType<typeof useBookPick> & { context: PickContext, morph: ReturnType<typeof useLabelMorph>, hovered: ReturnType<typeof useHoveredBook>, focused: ReturnType<typeof useFocusedBook>, insets: ReturnType<typeof useInspectInsets> }

/** Reads the Pick API where a view would: in setup, below an optional provider. */
function pickApi(provided?: PickContext): Promise<Api> {
  let api!: Api
  const Reader = defineComponent({
    setup() {
      api = { ...useBookPick(), context: usePickContext(), morph: useLabelMorph(), hovered: useHoveredBook(), focused: useFocusedBook(), insets: useInspectInsets() }
      return () => h('i')
    },
  })
  const Host = defineComponent({
    setup() {
      if (provided) providePickContext(provided)
      return () => h(Reader)
    },
  })
  return mountSuspended(Host).then(() => api)
}

beforeEach(() => {
  useState('book-pick').value = { bookId: null, face: 'front' }
  useState('books:label-morph').value = { active: false, cardHidden: false, cardFade: true, labelsHidden: false, labelBookId: null }
  useState('regal:library-loaded').value = 'test'
  useState<Book[]>('library:books').value = [MINE]
  useState('library:error').value = null
  useState('books:hovered').value = null
  useState('books:focused').value = null
  useState('books:inspect-insets').value = { top: 0, bottom: 0, sheetTop: null }
})

describe('Pick context: the default is the shared Pick', () => {
  it('useBookPick without a provider reads and writes useState(\'book-pick\')', async () => {
    const api = await pickApi()
    api.pick('a')
    expect(useState('book-pick').value).toEqual({ bookId: 'a', face: 'front' })
    api.flip()
    expect(useState<{ face: string }>('book-pick').value.face).toBe('back')
    useState('book-pick').value = { bookId: 'b', face: 'front' }
    expect(api.pickedId.value).toBe('b')
    api.putAway()
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
  })

  it('two views without a provider see the same Pick, morph flags and registries', async () => {
    const one = await pickApi()
    const two = await pickApi()
    one.pick('a')
    expect(two.pickedId.value).toBe('a')
    // useState hands out a ref per call: same data, not the same object.
    one.morph.value.labelBookId = 'a'
    expect(two.morph.value.labelBookId).toBe('a')
    expect(two.context.state.value).toEqual({ bookId: 'a', face: 'front' })
    expect(one.context.beforeChange).toBe(two.context.beforeChange)
    expect(one.context.labelSources).toBe(two.context.labelSources)
    expect(one.context.cardSources).toBe(two.context.cardSources)
  })

  it('onBeforePickChange on the shared context listens to the shared Pick, before it changes', async () => {
    const api = await pickApi()
    const seen: Array<[string | null, string | null, string | null]> = []
    const off = onBeforePickChange((previous, next) => seen.push([previous, next, useState<{ bookId: string | null }>('book-pick').value.bookId]), api.context)
    api.pick('a')
    api.pick('b')
    api.putAway()
    off()
    api.pick('c')
    expect(seen).toEqual([[null, 'a', null], ['a', 'b', 'a'], ['b', null, 'b']])
  })
})

describe('Pick context: a provided context is isolated', () => {
  it('a view below a provider reads and writes its own Pick, the shared one stays put', async () => {
    const reel = createPickContext()
    const inReel = await pickApi(reel)
    const shared = await pickApi()
    expect(inReel.context).toBe(reel)
    inReel.pick('a')
    expect(reel.state.value).toEqual({ bookId: 'a', face: 'front' })
    expect(inReel.pickedId.value).toBe('a')
    expect(shared.pickedId.value).toBeNull()
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
    shared.pick('b')
    expect(reel.state.value.bookId).toBe('a')
    expect(shared.pickedId.value).toBe('b')
  })

  it('has its own morph flags and registries', async () => {
    const reel = createPickContext()
    const inReel = await pickApi(reel)
    const shared = await pickApi()
    inReel.morph.value.active = true
    expect(shared.morph.value.active).toBe(false)
    const seen: string[] = []
    onBeforePickChange((_previous, next) => seen.push(`reel:${next}`), reel)
    shared.pick('a')
    expect(seen).toEqual([])
    inReel.pick('b')
    expect(seen).toEqual(['reel:b'])
  })

  it('providePickContext() without an argument makes a fresh context', async () => {
    let made!: PickContext
    const Host = defineComponent({
      setup() {
        made = providePickContext()
        return () => h('i')
      },
    })
    await mountSuspended(Host)
    expect(made.state.value).toEqual({ bookId: null, face: 'front' })
    expect(made).not.toBe(usePickContext())
  })

  it('hovered, focused and the inspect insets are the context\'s too, the shared ones stay put', async () => {
    const reel = createPickContext()
    const inReel = await pickApi(reel)
    const shared = await pickApi()
    inReel.hovered.value = 'a'
    inReel.focused.value = 'b'
    inReel.insets.value.sheetTop = 300
    inReel.insets.value.bottom = 200
    expect(reel.hovered.value).toBe('a')
    expect(reel.focused.value).toBe('b')
    expect(reel.insets.value).toEqual({ top: 0, bottom: 200, sheetTop: 300 })
    expect(shared.hovered.value).toBeNull()
    expect(shared.focused.value).toBeNull()
    expect(shared.insets.value).toEqual({ top: 0, bottom: 0, sheetTop: null })
    expect(useState('books:hovered').value).toBeNull()
    shared.hovered.value = 'c'
    shared.insets.value.sheetTop = 10
    expect(useState('books:hovered').value).toBe('c')
    expect(useState('books:inspect-insets').value).toEqual({ top: 0, bottom: 0, sheetTop: 10 })
    expect(reel.hovered.value).toBe('a')
  })

  it('the shared context looks Books up in the shared Library', async () => {
    const shared = await pickApi()
    expect(shared.context.bookById(MINE.id)).toEqual(MINE)
    expect(shared.context.bookById('nope')).toBeNull()
  })
})

/** A reel: its own Pick and its own Library, the hosting view's Details and morph box below the provider. */
function reelOf(context: PickContext, sheet = false) {
  return defineComponent({
    setup() {
      providePickContext(context)
      return () => h('div', { class: 'reel' }, [h(BooksDetails, { sheet }), h(BooksLabelMorph, { stage: null })])
    },
  })
}

describe('Pick context: its own Library and its own insets', () => {
  it('shows the reel\'s Book though the shared Library has none with that id', async () => {
    // Nothing of hers is in the global Library.
    useState<Book[]>('library:books').value = []
    const reel = createPickContext({ books: [ONLY_HERS] })
    reel.state.value = { bookId: ONLY_HERS.id, face: 'front' }
    const wrapper = await mountSuspended(reelOf(reel))
    await nextTick()
    await nextTick()
    expect(wrapper.find('.details__title').text()).toBe(ONLY_HERS.title)
  })

  it('equal ids: each card shows the Book of its own Library, and a reel without the Book shows none', async () => {
    const reel = createPickContext({ books: [HERS] })
    const Both = defineComponent({
      setup: () => () => h('div', [h('div', { class: 'shared' }, [h(BooksDetails)]), h('div', { class: 'reel-host' }, [h(reelOf(reel))])]),
    })
    reel.state.value = { bookId: HERS.id, face: 'front' }
    useState('book-pick').value = { bookId: MINE.id, face: 'front' }
    const wrapper = await mountSuspended(Both)
    await nextTick()
    await nextTick()
    expect(wrapper.find('.reel-host .details__title').text()).toBe(HERS.title)
    expect(wrapper.find('.shared .details__title').text()).toBe(MINE.title)
    // Her Book is not in your Library and the reel's pick is hers only: the shared card does not follow it.
    reel.state.value = { bookId: null, face: 'front' }
    await nextTick()
    await nextTick()
    expect(wrapper.find('.reel-host .details').exists()).toBe(false)
    expect(wrapper.find('.shared .details__title').text()).toBe(MINE.title)
    // A reel whose Library lacks the picked id shows nothing (never the shared Library's Book).
    reel.state.value = { bookId: 'only-mine', face: 'front' }
    useState<Book[]>('library:books').value = [MINE, book('only-mine', 'Only Mine')]
    await nextTick()
    await nextTick()
    expect(wrapper.find('.reel-host .details').exists()).toBe(false)
  })

  it('the reel\'s sheet reports its top edge into the reel\'s insets only', async () => {
    const reel = createPickContext({ books: [HERS] })
    reel.state.value = { bookId: HERS.id, face: 'front' }
    const wrapper = await mountSuspended(reelOf(reel, true))
    await nextTick()
    await nextTick()
    expect(wrapper.find('.details').exists()).toBe(true)
    // The sheet sits on the viewport's bottom edge: a viewport resize makes it report where its top is.
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(reel.insets.value.sheetTop).not.toBeNull()
    expect(useState<{ sheetTop: number | null }>('books:inspect-insets').value.sheetTop).toBeNull()
    wrapper.unmount()
    expect(reel.insets.value.sheetTop).toBeNull()
  })
})

describe('Pick context: label and card sources', () => {
  /** Registers a hover label and a card source, as the label and the details card do. */
  const Registrar = defineComponent({
    setup() {
      useLabelMorphLabel('hover', () => null)
      useLabelMorphCard(() => null)
      return () => h('i')
    },
  })
  const under = (context: PickContext) => defineComponent({
    setup() {
      providePickContext(context)
      return () => h(Registrar)
    },
  })

  it('register on mount and unregister on unmount, per context', async () => {
    const reel = createPickContext()
    const shared = useSharedPickContext()
    const sharedBefore = [shared.labelSources.size, shared.cardSources.size]
    const inReel = await mountSuspended(under(reel))
    expect([reel.labelSources.size, reel.cardSources.size]).toEqual([1, 1])
    expect([shared.labelSources.size, shared.cardSources.size]).toEqual(sharedBefore)
    const inShared = await mountSuspended(Registrar)
    expect([shared.labelSources.size, shared.cardSources.size]).toEqual([sharedBefore[0]! + 1, sharedBefore[1]! + 1])
    expect([reel.labelSources.size, reel.cardSources.size]).toEqual([1, 1])
    inReel.unmount()
    expect([reel.labelSources.size, reel.cardSources.size]).toEqual([0, 0])
    expect([shared.labelSources.size, shared.cardSources.size]).toEqual([sharedBefore[0]! + 1, sharedBefore[1]! + 1])
    inShared.unmount()
    expect([shared.labelSources.size, shared.cardSources.size]).toEqual(sharedBefore)
  })

  it('stay registered while kept alive and are not doubled when it comes back', async () => {
    const reel = createPickContext({ books: [HERS] })
    const show = ref(true)
    const Reel = defineComponent({ name: 'KeptReel', setup: () => () => h(reelOf(reel)) })
    const Other = defineComponent({ name: 'Other', render: () => h('p', 'shared') })
    const wrapper = await mountSuspended(defineComponent({
      setup: () => () => h(KeepAlive, null, { default: () => (show.value ? h(Reel) : h(Other)) }),
    }))
    reel.state.value = { bookId: HERS.id, face: 'front' }
    await nextTick()
    await nextTick()
    expect(wrapper.find('.details__title').text()).toBe(HERS.title)
    const listeners = reel.beforeChange.size
    expect(listeners).toBe(1)
    show.value = false
    await nextTick()
    // Deactivated, not unmounted: the Pick and its registrations are kept, and the shared Pick was never touched.
    expect(reel.state.value.bookId).toBe(HERS.id)
    expect(reel.beforeChange.size).toBe(listeners)
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
    show.value = true
    await nextTick()
    await nextTick()
    expect(reel.beforeChange.size).toBe(listeners)
    expect(wrapper.find('.details__title').text()).toBe(HERS.title)
    wrapper.unmount()
    expect(reel.beforeChange.size).toBe(0)
  })
})

describe('Pick context: the label morph', () => {
  it('a controller runs on its own context: two side by side do not follow each other', async () => {
    const reel = createPickContext({ books: [HERS] })
    // A hover label of hers is on screen in the reel; none in the shared view.
    const label = document.createElement('p')
    document.body.append(label)
    reel.labelSources.add({ kind: 'hover', read: () => ({ bookId: HERS.id, el: label }) })
    const Both = defineComponent({
      setup: () => () => h('div', [h(BooksLabelMorph, { stage: null }), h(reelOf(reel))]),
    })
    const wrapper = await mountSuspended(Both)
    const reelPick = useBookPick(reel)
    // Opening in the reel starts its morph (a label to grow the card from) and no one else's.
    reelPick.pick(HERS.id)
    expect(reel.morph.value.labelBookId).toBe(HERS.id)
    expect(reel.morph.value.active).toBe(true)
    expect(useState<{ active: boolean, labelBookId: string | null }>('books:label-morph').value).toMatchObject({ active: false, labelBookId: null })
    // The shared Pick changing does not move the reel's box.
    const shared = await pickApi()
    shared.pick(MINE.id)
    expect(reel.morph.value.labelBookId).toBe(HERS.id)
    expect(useState<{ cardFade: boolean }>('books:label-morph').value.cardFade).toBe(true)
    wrapper.unmount()
    // Unmounting stops the controller and ends its listener.
    expect(reel.beforeChange.size).toBe(0)
    expect(reel.morph.value.active).toBe(false)
    label.remove()
  })
})
