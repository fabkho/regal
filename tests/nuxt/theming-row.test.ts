// Theming of RegalBooksRow (README: "Theming"): the same `theme` / `unstyled`
// props and slots as RegalBooksStage, through to the card, its focus label
// (the tooltip) and the details (the detail panel). The 3D (TresCanvas) is
// stubbed, so this runs without WebGL; a Book is taken out through the card's
// own Pick.
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { h, nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { RegalBooksRow, RowCard } from '#components'
import { useRuntimeConfig, useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import type { PickState } from '#layers/regal/app/utils/books/pick'

const BOOK: Book = {
  id: 'fx-row-1',
  title: 'A Synthetic Row Book',
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
  description: 'A made-up blurb.',
}

type RowOptions = NonNullable<Parameters<typeof mountSuspended<typeof RegalBooksRow>>[1]>

/** The card's own state (script setup, read through the test wrapper). */
type CardState = { pick: PickState, ctx: { focused: { value: string | null } } }

async function mountRow(options: RowOptions = {}) {
  const wrapper = await mountSuspended(RegalBooksRow, {
    ...options,
    global: { stubs: { TresCanvas: true } },
  })
  await nextTick()
  return wrapper
}

/** Takes the Book out in the card (as a click on it would). */
async function pickBook(wrapper: VueWrapper) {
  const card = wrapper.findComponent(RowCard).vm as unknown as CardState
  card.pick = { bookId: BOOK.id, face: 'front' }
  await nextTick()
  await nextTick()
  return card
}

/** Puts the Book in focus (as the riffle or the mouse would). */
async function focusBook(wrapper: VueWrapper) {
  const card = wrapper.findComponent(RowCard).vm as unknown as CardState
  card.ctx.focused.value = BOOK.id
  await nextTick()
}

const regalConfig = () => useRuntimeConfig().public.regal as { librarySrc: string, theme?: string }

beforeEach(() => {
  // The Library is in (no fetch).
  useState('regal:library-loaded').value = regalConfig().librarySrc
  useState<Book[]>('library:books').value = [BOOK]
  useState('library:error').value = null
})

describe('RegalBooksRow theming', () => {
  it('is Regal\'s light look by default, scoped to .regal, the details too', async () => {
    const wrapper = await mountRow()
    const root = wrapper.find('.regal-books-row')
    expect(root.classes()).toContain('regal')
    expect(root.attributes('data-regal-theme')).toBe('light')
    await pickBook(wrapper)
    const details = wrapper.find('.row-card__details')
    expect(details.classes()).toContain('regal')
    expect(details.attributes('data-regal-theme')).toBe('light')
    expect(details.find('.row-card__book-title').text()).toBe(BOOK.title)
    expect(wrapper.find('.row-card__view').classes()).toContain('regal')
    expect(wrapper.find('.row-card__back').classes()).toContain('regal')
  })

  it('takes theme="dark" to the root and every surface', async () => {
    const wrapper = await mountRow({ props: { theme: 'dark' } })
    expect(wrapper.find('.regal-books-row').attributes('data-regal-theme')).toBe('dark')
    await pickBook(wrapper)
    for (const part of ['.row-card__view', '.row-card__back', '.row-card__details']) {
      expect(wrapper.find(part).attributes('data-regal-theme'), part).toBe('dark')
    }
  })

  it('uses the runtime config\'s theme without a prop', async () => {
    const config = regalConfig()
    const before = config.theme
    try {
      config.theme = 'dark'
      expect((await mountRow()).find('.regal-books-row').attributes('data-regal-theme')).toBe('dark')
    }
    finally {
      config.theme = before
    }
  })

  it('marks the root and the surfaces unstyled, keeping the structure', async () => {
    const wrapper = await mountRow({ props: { unstyled: true } })
    expect(wrapper.find('.regal-books-row').classes()).toContain('regal--unstyled')
    await pickBook(wrapper)
    expect(wrapper.find('.row-card__details').classes()).toContain('regal--unstyled')
    expect(wrapper.find('.row-card__book-title').text()).toBe(BOOK.title)
  })
})

describe('RegalBooksRow slots', () => {
  it('#tooltip replaces the focus label\'s content', async () => {
    const wrapper = await mountRow({
      slots: { tooltip: ({ book }: { book: Book }) => h('em', { class: 'host-tooltip' }, `${book.title} by ${book.author}`) },
    })
    await focusBook(wrapper)
    expect(wrapper.find('.row-focus .host-tooltip').text()).toBe('A Synthetic Row Book by Ada Example')
    expect(wrapper.find('.row-focus .title-stars__title').exists()).toBe(false)
  })

  it('#detail replaces the whole details; close puts the Book back', async () => {
    const wrapper = await mountRow({
      slots: {
        detail: ({ book, close, face, sheet }: { book: Book, close: () => void, face: string, sheet: boolean }) => h('div', { class: 'host-detail' }, [
          h('h2', book.title),
          h('span', { class: 'host-detail__face' }, `${face} ${sheet}`),
          h('button', { class: 'host-detail__close', onClick: close }, 'Done'),
        ]),
      },
    })
    const card = await pickBook(wrapper)
    const details = wrapper.find('.row-card__details')
    expect(details.classes()).toContain('regal')
    expect(details.find('.host-detail h2').text()).toBe(BOOK.title)
    expect(details.find('.host-detail__face').text()).toBe('front false')
    expect(details.find('.row-card__book-title').exists()).toBe(false)
    expect(details.find('.row-card__book-hint').exists()).toBe(false)
    await details.find('.host-detail__close').trigger('click')
    expect(card.pick.bookId).toBeNull()
  })

  it('#detail-header, #detail-meta and #detail-actions replace their parts only', async () => {
    const wrapper = await mountRow({
      slots: {
        'detail-meta': ({ meta }: { meta: string[] }) => meta.map(part => h('span', { class: 'host-chip' }, part)),
        'detail-actions': ({ flip }: { flip: () => void }) => h('button', { class: 'host-flip', onClick: flip }, 'Flip'),
      },
    })
    const card = await pickBook(wrapper)
    expect(wrapper.findAll('.host-chip').map(chip => chip.text())).toEqual(['Ada Example', '1 Mar 2025'])
    expect(wrapper.find('.row-card__book-meta').exists()).toBe(false)
    expect(wrapper.find('.row-card__book-title').text()).toBe(BOOK.title)
    expect(wrapper.find('.row-card__book-hint').exists()).toBe(false)
    await wrapper.find('.host-flip').trigger('click')
    expect(card.pick.face).toBe('back')

    const header = await mountRow({
      slots: { 'detail-header': ({ book }: { book: Book }) => h('h2', { class: 'host-header' }, book.title.toUpperCase()) },
    })
    await pickBook(header)
    expect(header.find('.host-header').text()).toBe('A SYNTHETIC ROW BOOK')
    expect(header.find('.row-card__book-title').exists()).toBe(false)
    expect(header.find('.row-card__book-hint').exists()).toBe(true)
  })
})

describe('RegalBooksRow Back', () => {
  it('shows Regal\'s Back by default; :back-button="false" hides it, the browser\'s Back still puts the Book back', async () => {
    const shown = await mountRow()
    await pickBook(shown)
    expect(shown.find('.row-card__back').exists()).toBe(true)

    const hidden = await mountRow({ props: { backButton: false } })
    const card = await pickBook(hidden)
    expect(hidden.find('.row-card__back').exists()).toBe(false)
    expect(hidden.find('.row-card__details').exists()).toBe(true)
    // A history entry while the Book is out (Escape and a tap beside it go through the stubbed 3D).
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()
    expect(card.pick.bookId).toBeNull()
  })

  it('#back replaces it where it goes; close puts the Book back', async () => {
    const wrapper = await mountRow({
      slots: { back: ({ book, close, broken }: { book: Book, close: () => void, broken: boolean }) => h('button', { class: 'host-back', onClick: close }, `${book.title} ${broken}`) },
    })
    const card = await pickBook(wrapper)
    expect(wrapper.find('.row-card__back').exists()).toBe(false)
    const slot = wrapper.find('.row-card__back-slot')
    expect(slot.classes()).toContain('regal')
    expect(slot.find('.host-back').text()).toBe(`${BOOK.title} false`)
    await slot.find('.host-back').trigger('click')
    expect(card.pick.bookId).toBeNull()
  })
})
