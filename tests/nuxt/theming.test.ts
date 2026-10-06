// Theming of the tooltip and the Book detail panel (docs/nuxt-layer.md: "Theming"):
// RegalBooksStage's `theme` / `unstyled` props, the runtime config's theme and
// the host's slots, through to the surfaces. The 3D (LibraryStage) is stubbed
// with what renders the surfaces, so this runs without WebGL.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick } from 'vue'
import { BooksDetails, BooksHostSlot, RegalBooksStage } from '#components'
import { useRuntimeConfig, useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import SlotSwitch from './fixtures/SlotSwitch.vue'

const BOOK: Book = {
  id: 'fx-1',
  title: 'A Synthetic Book',
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

/** Stands in for LibraryStage: the detail panel and a tooltip, the way the stage renders them. */
const StageStub = defineComponent({
  setup() {
    return () => h('div', { class: 'stub-stage' }, [
      h(BooksDetails),
      h('p', { class: 'stub-tooltip' }, [
        h(BooksHostSlot, { name: 'tooltip', scope: { book: BOOK } }, () => h('span', { class: 'stub-tooltip__regal' }, BOOK.title)),
      ]),
    ])
  },
})

type StageOptions = NonNullable<Parameters<typeof mountSuspended<typeof RegalBooksStage>>[1]>

async function mountStage(options: StageOptions = {}) {
  const wrapper = await mountSuspended(RegalBooksStage, {
    ...options,
    global: { stubs: { LibraryStage: StageStub } },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

const regalConfig = () => useRuntimeConfig().public.regal as { librarySrc: string, theme?: string }

beforeEach(() => {
  // The Library is in (no fetch), one Book is out.
  useState('regal:library-loaded').value = regalConfig().librarySrc
  useState<Book[]>('library:books').value = [BOOK]
  useState('library:error').value = null
  useState('book-pick').value = { bookId: BOOK.id, face: 'front' }
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('RegalBooksStage theming', () => {
  it('is Regal\'s light look by default, scoped to .regal', async () => {
    const wrapper = await mountStage()
    const root = wrapper.find('.regal-books-stage')
    expect(root.classes()).toContain('regal')
    expect(root.attributes('data-regal-theme')).toBe('light')
    const panel = wrapper.find('.details')
    expect(panel.classes()).toContain('regal')
    expect(panel.classes()).not.toContain('regal--unstyled')
    expect(panel.attributes('data-regal-theme')).toBe('light')
    expect(panel.find('.details__title').text()).toBe(BOOK.title)
    expect(panel.find('.details__description').text()).toBe(BOOK.description)
    expect(wrapper.find('.stub-tooltip__regal').exists()).toBe(true)
  })

  it('takes theme="dark" to the root and the panel', async () => {
    const wrapper = await mountStage({ props: { theme: 'dark' } })
    expect(wrapper.find('.regal-books-stage').attributes('data-regal-theme')).toBe('dark')
    expect(wrapper.find('.details').attributes('data-regal-theme')).toBe('dark')
  })

  it('uses the runtime config\'s theme without a prop, and ignores an unknown one', async () => {
    const config = regalConfig()
    const before = config.theme
    try {
      config.theme = 'dark'
      expect((await mountStage()).find('.details').attributes('data-regal-theme')).toBe('dark')
      config.theme = 'sepia'
      expect((await mountStage()).find('.details').attributes('data-regal-theme')).toBe('light')
    }
    finally {
      config.theme = before
    }
  })

  it('follows the host\'s data-theme with theme="auto"', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const wrapper = await mountStage({ props: { theme: 'auto' }, attachTo: document.body })
    await nextTick()
    expect(wrapper.find('.details').attributes('data-regal-theme')).toBe('dark')
    document.documentElement.setAttribute('data-theme', 'light')
    // The MutationObserver reports on a microtask, the change lands on the next frame.
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()
    expect(wrapper.find('.details').attributes('data-regal-theme')).toBe('light')
    wrapper.unmount()
  })

  it('marks every surface unstyled', async () => {
    const wrapper = await mountStage({ props: { unstyled: true } })
    expect(wrapper.find('.regal-books-stage').classes()).toContain('regal--unstyled')
    expect(wrapper.find('.details').classes()).toContain('regal--unstyled')
    // Structure stays.
    expect(wrapper.find('.details__title').text()).toBe(BOOK.title)
  })
})

describe('RegalBooksStage slots', () => {
  it('#tooltip replaces the label\'s content with the host\'s, given the Book', async () => {
    const wrapper = await mountStage({
      slots: { tooltip: ({ book }: { book: Book }) => h('em', { class: 'host-tooltip' }, `${book.title} by ${book.author}`) },
    })
    expect(wrapper.find('.stub-tooltip__regal').exists()).toBe(false)
    expect(wrapper.find('.host-tooltip').text()).toBe('A Synthetic Book by Ada Example')
  })

  it('#detail replaces the whole panel content; close puts the Book back', async () => {
    const wrapper = await mountStage({
      slots: {
        detail: ({ book, close, face }: { book: Book, close: () => void, face: string }) => h('div', { class: 'host-detail' }, [
          h('h2', book.title),
          h('span', { class: 'host-detail__face' }, face),
          h('button', { class: 'host-detail__close', onClick: close }, 'Done'),
        ]),
      },
    })
    const panel = wrapper.find('.details')
    // Regal keeps the frame (and its theme), the host renders inside.
    expect(panel.classes()).toContain('regal')
    expect(panel.find('.host-detail h2').text()).toBe(BOOK.title)
    expect(panel.find('.host-detail__face').text()).toBe('front')
    expect(panel.find('.details__title').exists()).toBe(false)
    expect(panel.find('.details__actions').exists()).toBe(false)
    await panel.find('.host-detail__close').trigger('click')
    expect((useState('book-pick').value as { bookId: string | null }).bookId).toBeNull()
  })

  it('#detail-header, #detail-meta, #detail-about and #detail-actions replace their parts only', async () => {
    const wrapper = await mountStage({
      slots: {
        'detail-header': ({ book }: { book: Book }) => h('h2', { class: 'host-header' }, book.title.toUpperCase()),
        'detail-about': ({ description }: { description: string | null }) => h('p', { class: 'host-about' }, `About: ${description}`),
        'detail-actions': ({ close }: { close: () => void }) => h('button', { class: 'host-close', onClick: close }, 'Close'),
      },
    })
    const panel = wrapper.find('.details')
    expect(panel.find('.host-header').text()).toBe('A SYNTHETIC BOOK')
    expect(panel.find('.details__title').exists()).toBe(false)
    expect(panel.find('.host-about').text()).toBe('About: A made-up blurb.')
    expect(panel.find('.details__description').exists()).toBe(false)
    expect(panel.find('.details__button').exists()).toBe(false)
    expect(panel.find('.host-close').exists()).toBe(true)
    // What wasn't replaced is Regal's.
    expect(panel.find('.details__hint').exists()).toBe(true)
  })

  it('#detail-meta gets the meta line\'s parts', async () => {
    const wrapper = await mountStage({
      slots: { 'detail-meta': ({ meta }: { meta: string[] }) => meta.map(part => h('span', { class: 'host-chip' }, part)) },
    })
    const chips = wrapper.findAll('.host-chip').map(chip => chip.text())
    expect(chips).toEqual(['Read', 'Finished 1 Mar 2025', '200 pages', 'Paperback'])
    expect(wrapper.find('.details__title').text()).toBe(BOOK.title)
  })

  it('switches between Regal\'s markup and a slot the host passes only sometimes', async () => {
    const wrapper = await mountSuspended(SlotSwitch, {
      props: { custom: false },
      global: { stubs: { LibraryStage: StageStub } },
    })
    await nextTick()
    const titles = () => ({ regal: wrapper.findAll('.details__title').length, host: wrapper.findAll('.host-title').length })
    expect(titles()).toEqual({ regal: 1, host: 0 })
    await wrapper.setProps({ custom: true })
    await nextTick()
    expect(titles()).toEqual({ regal: 0, host: 1 })
    await wrapper.setProps({ custom: false })
    await nextTick()
    expect(titles()).toEqual({ regal: 1, host: 0 })
  })
})
