// The Pick context (utils/books/pickContext.ts, composables/useBookPick.ts):
// without a provider every view uses the shared global Pick; below a provider
// the views get a Pick of their own, isolated from the shared one.
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick } from 'vue'
import { BooksDetails } from '#components'
import { useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import type { PickContext } from '#layers/regal/app/utils/books/pickContext'
import { createPickContext } from '#layers/regal/app/utils/books/pickContext'
import { onBeforePickChange, providePickContext, usePickContext, useBookPick } from '#layers/regal/app/composables/useBookPick'
import { useLabelMorph } from '#layers/regal/app/composables/useLabelMorph'

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

type Api = ReturnType<typeof useBookPick> & { context: PickContext, morph: ReturnType<typeof useLabelMorph> }

/** Reads the Pick API where a view would: in setup, below an optional provider. */
function pickApi(provided?: PickContext): Promise<Api> {
  let api!: Api
  const Reader = defineComponent({
    setup() {
      api = { ...useBookPick(), context: usePickContext(), morph: useLabelMorph() }
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

  it('onBeforePickChange without a context listens to the shared Pick, before it changes', async () => {
    const api = await pickApi()
    const seen: Array<[string | null, string | null, string | null]> = []
    const off = onBeforePickChange((previous, next) => seen.push([previous, next, useState<{ bookId: string | null }>('book-pick').value.bookId]))
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

  it('Book ids may be equal: the details card follows the Pick of its own view', async () => {
    const reel = createPickContext()
    const Reel = defineComponent({
      setup() {
        providePickContext(reel)
        return () => h('div', { class: 'reel' }, [h(BooksDetails)])
      },
    })
    const Both = defineComponent({
      setup: () => () => h('div', [h('div', { class: 'shared' }, [h(BooksDetails)]), h(Reel)]),
    })
    // Taken out in the reel only.
    reel.state.value = { bookId: MINE.id, face: 'front' }
    const wrapper = await mountSuspended(Both)
    await nextTick()
    await nextTick()
    expect(wrapper.find('.reel .details').exists()).toBe(true)
    expect(wrapper.find('.reel .details__title').text()).toBe(MINE.title)
    expect(wrapper.find('.shared .details').exists()).toBe(false)
    // And only in the shared Pick: the reel's card goes, the shared one comes.
    reel.state.value = { bookId: null, face: 'front' }
    useState('book-pick').value = { bookId: MINE.id, face: 'front' }
    await nextTick()
    await nextTick()
    expect(wrapper.find('.shared .details__title').text()).toBe(MINE.title)
    expect(wrapper.find('.reel .details__title').exists()).toBe(false)
  })
})
