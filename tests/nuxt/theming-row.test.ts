// Theming of RegalBooksRow (docs/nuxt-layer.md: "Theming"): the same `theme` / `unstyled`
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
type CardState = { pick: PickState, ctx: { focused: { value: string | null }, floorShadow: { value: number }, veil: { color: string, opacity: number, opacityFull: number } } }

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

describe('RegalBooksRow focus label: the rating\'s number', () => {
  it('shows the number after the stars, two decimals only when needed', async () => {
    useState<Book[]>('library:books').value = [{ ...BOOK, rating: 4.25 }]
    const wrapper = await mountRow()
    await focusBook(wrapper)
    const rating = wrapper.find('.row-focus .title-stars__rating')
    // The drawn stars and the number are out of the accessibility tree; one hidden text says it in words.
    expect(rating.find('.title-stars__stars').attributes('aria-hidden')).toBe('true')
    expect(rating.find('.regal-visually-hidden').text()).toBe('4.25 of 5 stars')
    expect(rating.find('.title-stars__value').text()).toBe('4.25')
    // After the stars: the stars come first.
    expect(rating.element.firstElementChild?.classList.contains('title-stars__stars')).toBe(true)
    // Read once, by the hidden text.
    expect(rating.find('.title-stars__value').attributes('aria-hidden')).toBe('true')
  })

  it('shows neither stars nor a number for an unrated Book', async () => {
    useState<Book[]>('library:books').value = [{ ...BOOK, rating: 0 }]
    const wrapper = await mountRow()
    await focusBook(wrapper)
    expect(wrapper.find('.row-focus .title-stars__rating').exists()).toBe(false)
    expect(wrapper.find('.row-focus .title-stars__value').exists()).toBe(false)
  })
})

describe('RegalBooksRow floor shadow and dates', () => {
  it('has Regal\'s floor shadow in the light theme, none in the dark, switching live', async () => {
    const wrapper = await mountRow()
    const card = wrapper.findComponent(RowCard).vm as unknown as CardState
    expect(card.ctx.floorShadow.value).toBe(1)
    await wrapper.setProps({ theme: 'dark' })
    await nextTick()
    await nextTick()
    expect(card.ctx.floorShadow.value).toBe(0)
    await wrapper.setProps({ theme: 'light' })
    await nextTick()
    await nextTick()
    expect(card.ctx.floorShadow.value).toBe(1)
  })

  it('has today\'s veil behind a Book taken out unless a host sets the tokens', async () => {
    const wrapper = await mountRow()
    const card = wrapper.findComponent(RowCard).vm as unknown as CardState
    expect(card.ctx.veil.opacity).toBe(0.72)
    expect(card.ctx.veil.opacityFull).toBe(0.9)
    // The tokens themselves are read through getComputedStyle, which happy-dom doesn't do for custom properties (checked in a browser).
    await pickBook(wrapper)
    expect(card.ctx.veil.opacityFull).toBe(0.9)
    expect(card.ctx.veil.opacity).toBe(0.72)
  })

  it('fades the dates out while a Book is out', async () => {
    const wrapper = await mountRow()
    expect(wrapper.find('.row-card__labels').classes()).not.toContain('row-card__labels--hidden')
    await pickBook(wrapper)
    expect(wrapper.find('.row-card__labels').classes()).toContain('row-card__labels--hidden')
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

describe('RegalBooksRow for assistive technology', () => {
  const SECOND: Book = { ...BOOK, id: 'fx-row-2', title: 'Another Row Book', author: null, rating: 0, dateRead: null, status: 'currently-reading' }

  it('names the scroller as a region (a label needs a role)', async () => {
    const wrapper = await mountRow()
    const scroller = wrapper.find('.row-card__scroller')
    expect(scroller.attributes('role')).toBe('region')
    expect(scroller.attributes('aria-label')).toBe('1 books, scroll sideways')
  })

  it('lists the Books as buttons: title, author, month finished, rating in words', async () => {
    useState<Book[]>('library:books').value = [BOOK, SECOND]
    const wrapper = await mountRow()
    const items = wrapper.findAll('.regal-book-list li button')
    // In the row's own order: what is being read now first, then the newest read.
    expect(items.map(item => item.text())).toEqual([
      'Another Row Book, reading now',
      'A Synthetic Row Book, Ada Example, finished March 2025, 4 of 5 stars',
    ])
    expect(wrapper.find('.regal-book-list').attributes('role')).toBe('list')
    // One Tab stop for the whole list.
    expect(items.map(item => item.attributes('tabindex'))).toEqual(['0', '-1'])
  })

  it('takes the Book out when its button is pressed, into a labelled dialog', async () => {
    const wrapper = await mountRow()
    await wrapper.find('.regal-book-list button').trigger('click')
    await nextTick()
    await nextTick()
    const card = wrapper.findComponent(RowCard).vm as unknown as CardState
    expect(card.pick.bookId).toBe(BOOK.id)
    const dialog = wrapper.find('.row-card__details')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('tabindex')).toBe('-1')
    // In the card it is not modal; the title names it.
    expect(dialog.attributes('aria-modal')).toBeUndefined()
    const title = wrapper.find('.row-card__book-title')
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'))
    expect(dialog.attributes('aria-label')).toBeUndefined()
  })

  it('is left out with accessible-list off', async () => {
    const wrapper = await mountRow({ props: { accessibleList: false } })
    expect(wrapper.find('.regal-book-list').exists()).toBe(false)
    expect(wrapper.find('.row-card__scroller').exists()).toBe(true)
  })

  it('names the dialog by its own label when the host replaces the title', async () => {
    const wrapper = await mountRow({ slots: { 'detail-header': () => h('p', 'Mine') } })
    await pickBook(wrapper)
    const dialog = wrapper.find('.row-card__details')
    expect(dialog.attributes('aria-labelledby')).toBeUndefined()
    expect(dialog.attributes('aria-label')).toBe('A Synthetic Row Book details')
  })
})
