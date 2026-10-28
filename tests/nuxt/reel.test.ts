// RegalBooksReel's wiring (components/regal/BooksReel.vue, components/reel/Card.vue):
// its own Library from the document it is given, its own Pick (a Book out in
// the reel is out nowhere else, though the shared Library has a Book with the
// same id), the Stack's details with the reel's actions (Open book emits
// `open` and puts the Book back), the pause button (WCAG 2.2.2) and the keys.
// The 3D (TresCanvas) is stubbed, so this runs without WebGL; a Book is taken
// out through the reel's Book list, as a screen reader would.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { h, nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { RegalBooksReel } from '#components'
import { useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'

/** Synthetic: three Books (an arc with ends) and a fourth for a ringing one. */
function libraryOf(count: number): RegalLibraryFile {
  const titles = ['Alpha Synthetic', 'Beta Synthetic', 'Gamma Synthetic', 'Delta Synthetic']
  return {
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    owner: 'Test Reader',
    books: titles.slice(0, count).map((title, index) => ({
      id: `fx-reel-${index + 1}`,
      title,
      authors: [`Author ${index + 1}`],
      status: 'read',
      rating: 0,
      assets: { color: '#336699' },
    })),
  }
}

const SHARED: Book = {
  id: 'fx-reel-2',
  title: 'The shared Library\'s own Book',
  seriesTitle: null,
  author: 'Someone Else',
  additionalAuthors: [],
  isbn10: null,
  isbn13: null,
  pages: 100,
  binding: null,
  yearPublished: null,
  originalYear: null,
  rating: 3,
  status: 'read',
  tags: [],
  dateRead: null,
  dateAdded: null,
  review: null,
  reviewHasSpoiler: false,
  readCount: 1,
  description: null,
}

type ReelOptions = NonNullable<Parameters<typeof mountSuspended<typeof RegalBooksReel>>[1]>
const mounted: VueWrapper[] = []

async function mountReel(options: ReelOptions = {}) {
  const wrapper = await mountSuspended(RegalBooksReel, {
    ...options,
    props: { library: libraryOf(3), autoplay: false, ...options.props },
    global: { stubs: { TresCanvas: true } },
    attachTo: document.body,
  })
  mounted.push(wrapper as VueWrapper)
  await nextTick()
  return wrapper
}

const card = (wrapper: VueWrapper) => wrapper.find('.reel-card')
/** The Book list's button for a title (a screen reader's way to take a Book out). */
async function takeOut(wrapper: VueWrapper, title: string) {
  const button = wrapper.findAll('button').find(candidate => candidate.text().includes(title))
  expect(button, title).toBeTruthy()
  await button!.trigger('click')
  await nextTick()
  await nextTick()
}
const details = () => document.body.querySelector<HTMLElement>('.reel-card__details')
const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

beforeEach(() => {
  useState('book-pick').value = { bookId: null, face: 'front' }
  useState<Book[]>('library:books').value = [SHARED]
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.documentElement.style.overflow = ''
})

describe('RegalBooksReel: its own Library', () => {
  it('shows the document\'s Books, never the shared Library', async () => {
    const wrapper = await mountReel()
    expect(card(wrapper).attributes('data-book-count')).toBe('3')
    expect(wrapper.find('.reel-caption__title').text()).toBe('Alpha Synthetic')
    expect(wrapper.text()).not.toContain(SHARED.title)
    expect(useState<Book[]>('library:books').value).toEqual([SHARED])
  })

  it('says so when there are no Books, and shows an invalid document\'s errors', async () => {
    expect((await mountReel({ props: { library: libraryOf(0) } })).text()).toContain('No books to show')
    const broken = await mountReel({ props: { library: { version: 2, books: [{ id: 1 }] } as unknown as RegalLibraryFile } })
    expect(broken.find('.regal-books-reel__error').exists()).toBe(true)
  })
})

describe('RegalBooksReel: its own Pick and the Stack\'s details', () => {
  it('takes a Book out in the reel only: it comes to the front, the details show the reel\'s Book', async () => {
    const wrapper = await mountReel()
    await takeOut(wrapper, 'Beta Synthetic')
    expect(card(wrapper).attributes('data-picked')).toBe('fx-reel-2')
    expect(card(wrapper).attributes('data-mode')).toBe('detail')
    expect(card(wrapper).attributes('data-front')).toBe('1')
    // The shared Pick (Your shelf next to it) has nothing out, though it has a Book with this id.
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
    expect(details()?.textContent).toContain('Beta Synthetic')
    expect(details()?.textContent).not.toContain(SHARED.title)
    // Broken out: the page stays still under it.
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('has the reel\'s actions: Show back, Put back and Open book', async () => {
    const wrapper = await mountReel({ props: { labels: { open: 'Buch öffnen' } } })
    await takeOut(wrapper, 'Alpha Synthetic')
    const labels = [...details()!.querySelectorAll('button')].map(button => button.textContent?.trim())
    expect(labels).toEqual(expect.arrayContaining(['Show back', 'Put back', 'Buch öffnen →']))
    const putBack = [...details()!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Put back')!
    putBack.click()
    await nextTick()
    expect(card(wrapper).attributes('data-picked')).toBe('')
    expect(card(wrapper).attributes('data-mode')).toBe('manual')
  })

  it('Open book emits `open` with the Book and puts it back at once', async () => {
    const wrapper = await mountReel()
    await takeOut(wrapper, 'Gamma Synthetic')
    const open = [...details()!.querySelectorAll('button')].find(button => button.textContent?.includes('Open book'))!
    open.click()
    await nextTick()
    expect(card(wrapper).attributes('data-picked')).toBe('')
    // Told once the Book's history entry is gone (the host may push a page then).
    await settle(450)
    const events = wrapper.emitted('open') as [{ id: string, index: number, book: Book }][]
    expect(events).toHaveLength(1)
    expect(events[0]![0]).toMatchObject({ id: 'fx-reel-3', index: 2 })
    expect(events[0]![0].book.title).toBe('Gamma Synthetic')
  })

  it('hands a host\'s #detail-actions an `open` too, and its #detail-meta the Book', async () => {
    const wrapper = await mountReel({
      slots: {
        'detail-meta': ({ book }: { book: Book }) => h('p', { class: 'host-meta' }, `meta of ${book.title}`),
        'detail-actions': ({ open }: { open: () => void }) => h('button', { class: 'host-open', onClick: open }, 'Host open'),
      },
    })
    await takeOut(wrapper, 'Beta Synthetic')
    expect(details()!.querySelector('.host-meta')?.textContent).toBe('meta of Beta Synthetic')
    details()!.querySelector<HTMLButtonElement>('.host-open')!.click()
    await nextTick()
    await settle(450)
    expect((wrapper.emitted('open') as unknown[][])[0]![0]).toMatchObject({ id: 'fx-reel-2' })
  })

  it('Escape puts the Book back into the reel', async () => {
    const wrapper = await mountReel()
    await takeOut(wrapper, 'Alpha Synthetic')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(card(wrapper).attributes('data-picked')).toBe('')
  })
})

describe('RegalBooksReel: the pause button and the keys', () => {
  it('reads Play when still, Pause while it plays (the host\'s words), and a pause is a takeover', async () => {
    const wrapper = await mountReel({ props: { labels: { play: 'Abspielen', pause: 'Anhalten' } } })
    const button = () => wrapper.find('.reel-card__pause')
    expect(button().attributes('aria-label')).toBe('Abspielen')
    await button().trigger('click')
    expect(card(wrapper).attributes('data-mode')).toBe('playing')
    expect(button().attributes('aria-label')).toBe('Anhalten')
    expect(wrapper.emitted('manual')).toBeUndefined()
    await button().trigger('click')
    expect(card(wrapper).attributes('data-mode')).toBe('manual')
    expect(wrapper.emitted('manual')).toHaveLength(1)
  })

  it('has no pause button where nothing moves on its own: one Book, or Reduce Motion', async () => {
    expect((await mountReel({ props: { library: libraryOf(1) } })).find('.reel-card__pause').exists()).toBe(false)
    expect((await mountReel({ props: { reducedMotion: true } })).find('.reel-card__pause').exists()).toBe(false)
  })

  it('steps with the arrow keys and tells the host which Book is in front', async () => {
    const wrapper = await mountReel({ props: { reducedMotion: true } })
    const stage = wrapper.find('.reel-card__stage')
    await stage.trigger('keydown', { key: 'ArrowRight' })
    expect(card(wrapper).attributes('data-front')).toBe('1')
    const focus = wrapper.emitted('focus') as [{ id: string, index: number }][]
    expect(focus.at(-1)![0]).toMatchObject({ id: 'fx-reel-2', index: 1 })
    // An arc with ends stops at its last Book.
    await stage.trigger('keydown', { key: 'ArrowRight' })
    await stage.trigger('keydown', { key: 'ArrowRight' })
    expect(card(wrapper).attributes('data-front')).toBe('2')
    // Enter takes the Book in front out.
    await stage.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(card(wrapper).attributes('data-picked')).toBe('fx-reel-3')
  })

  it('names the Book in front for assistive technology', async () => {
    const wrapper = await mountReel({ props: { labels: { slide: '{n} von {count}' } } })
    expect(wrapper.find('.reel-card__stage').attributes('aria-label')).toBe('1 von 3, Alpha Synthetic, Author 1')
    expect(card(wrapper).attributes('aria-roledescription')).toBe('carousel')
  })
})
