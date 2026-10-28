// The reel's risky wiring, driven through its card (components/reel/Card.vue)
// with the 3D stubbed: the frame loop is the card's own `ctx.tick` (what
// ReelScene calls every frame), visibility comes from a stand-in
// IntersectionObserver and Reduce Motion from a stand-in matchMedia, so the
// state machine runs as on a page. Covers: isolation from a real Stack beside
// it and under <KeepAlive>, takeovers (swipe, tap on a neighbour, a tap beside,
// Pause after Play), the history entry (Back, Open book after it is gone), the
// rest off screen and in a hidden tab, and Reduce Motion switched on mid-play.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { ReelCard, RegalBooksReel, RegalBooksStage } from '#components'
import { useRuntimeConfig, useState } from '#imports'
import type { Book } from '#layers/regal/shared/types/book'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { ReelContext } from '#layers/regal/app/utils/reel/context'
import type { ReelState } from '#layers/regal/app/utils/reel/state'
import { REEL_BEAT } from '#layers/regal/app/utils/reel/timeline'

function libraryOf(count: number): RegalLibraryFile {
  return {
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    books: Array.from({ length: count }, (_, index) => ({
      id: `fx-wire-${index + 1}`,
      title: `Wired ${index + 1}`,
      authors: ['Ada Example'],
      status: 'read',
      rating: 0,
      assets: { color: '#336699' },
    })),
  }
}

/** The shared Library's Book with an id the reel has too. */
const SHARED: Book = {
  id: 'fx-wire-2', title: 'Shared, same id', seriesTitle: null, author: 'Someone', additionalAuthors: [],
  isbn10: null, isbn13: null, pages: 100, binding: null, yearPublished: null, originalYear: null, rating: 3,
  status: 'read', tags: [], dateRead: '2025-01-01', dateAdded: null, review: null, reviewHasSpoiler: false,
  readCount: 1, description: null,
}

// --- Stand-ins for what the browser would tell the reel --------------------------------

const observers: { callback: IntersectionObserverCallback, element: Element | null }[] = []
class FakeObserver {
  entry: { callback: IntersectionObserverCallback, element: Element | null }
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, element: null }
    observers.push(this.entry)
  }

  observe(element: Element) {
    this.entry.element = element
  }

  unobserve() {}
  disconnect() {
    const index = observers.indexOf(this.entry)
    if (index >= 0) observers.splice(index, 1)
  }

  takeRecords() {
    return []
  }
}

/** The reel's card in view (ratio 1) or out of it. */
function inView(visible: boolean) {
  for (const { callback, element } of [...observers]) {
    if (!element?.classList.contains('reel-card')) continue
    const rect = { height: visible ? 400 : 0, width: 390, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0 }
    callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0, intersectionRect: rect, target: element } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
  }
}

const reduceListeners = new Set<(event: { matches: boolean }) => void>()
let reduceMotion = false
function fakeMatchMedia(query: string) {
  const reduce = query.includes('prefers-reduced-motion')
  return {
    get matches() {
      return reduce && reduceMotion
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => reduce && reduceListeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => reduceListeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
}
function setReduceMotion(value: boolean) {
  reduceMotion = value
  for (const listener of reduceListeners) listener({ matches: value })
}

// --- Mounting and driving ----------------------------------------------------------------

type CardVm = { ctx: ReelContext, state: ReelState }
const mounted: VueWrapper[] = []

async function mountReel(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(RegalBooksReel, {
    props: { library: libraryOf(6), ...props } as never,
    global: { stubs: { TresCanvas: true } },
    attachTo: document.body,
  })
  mounted.push(wrapper as VueWrapper)
  await nextTick()
  return wrapper as VueWrapper
}

const card = (wrapper: VueWrapper) => wrapper.findComponent(ReelCard).vm as unknown as CardVm
const attr = (wrapper: VueWrapper, name: string) => wrapper.find('.reel-card').attributes(name)
let clock = 0
/** Runs the reel's frames for `ms` (what ReelScene does, 16 ms at a time). */
async function frames(wrapper: VueWrapper, ms: number) {
  const { ctx } = card(wrapper)
  for (let t = 0; t < ms; t += 16) {
    clock += 16
    ctx.tick(16, clock)
  }
  await nextTick()
}
function pointer(type: string, x: number, target: EventTarget = window) {
  const event = new PointerEvent(type, { pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: x, clientY: 100, bubbles: true, button: 0 })
  target.dispatchEvent(event)
}
async function takeOut(wrapper: VueWrapper, title: string) {
  await wrapper.findAll('button').find(button => button.text().includes(title))!.trigger('click')
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  observers.length = 0
  reduceListeners.clear()
  reduceMotion = false
  clock = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.spyOn(window, 'matchMedia').mockImplementation(fakeMatchMedia as never)
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  useState('book-pick').value = { bookId: null, face: 'front' }
  useState('regal:library-loaded').value = (useRuntimeConfig().public.regal as { librarySrc: string }).librarySrc
  useState<Book[]>('library:books').value = [SHARED]
  useState('library:error').value = null
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.style.overflow = ''
})

describe('the reel beside a real Stack, and kept alive', () => {
  it('a Book out in the reel is out nowhere else, and the Stack\'s Book is not out in the reel', async () => {
    const Host = defineComponent({
      setup: () => () => h('div', [h(RegalBooksStage), h(RegalBooksReel, { library: libraryOf(4), autoplay: false })]),
    })
    const wrapper = await mountSuspended(Host, { global: { stubs: { TresCanvas: true } }, attachTo: document.body })
    mounted.push(wrapper as VueWrapper)
    await nextTick()
    await takeOut(wrapper as VueWrapper, 'Wired 2')
    expect(wrapper.find('.reel-card').attributes('data-picked')).toBe('fx-wire-2')
    expect(wrapper.find('.stage').attributes('data-picked')).toBe('')
    expect(useState<{ bookId: string | null }>('book-pick').value.bookId).toBeNull()
    // The reel's details show its own Book, not the shared one with the same id.
    expect(document.body.querySelector('.reel-card__details')?.textContent).toContain('Wired 2')
    expect(document.body.querySelector('.reel-card__details')?.textContent).not.toContain(SHARED.title)

    // The other way round: the Stack takes its Book out, the reel's stays as it is.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    useState('book-pick').value = { bookId: SHARED.id, face: 'front' }
    await nextTick()
    expect(wrapper.find('.reel-card').attributes('data-picked')).toBe('')
    expect(wrapper.find('.stage').attributes('data-picked')).toBe(SHARED.id)
  })

  it('kept alive and left: the Book goes back, nothing is drawn; back again it is a new visit and plays', async () => {
    const shown = ref(true)
    const Other = defineComponent({ name: 'OtherPage', render: () => h('p', 'elsewhere') })
    const Host = defineComponent({
      setup: () => () => h(KeepAlive, null, [shown.value ? h(RegalBooksReel, { key: 'reel', library: libraryOf(6) }) : h(Other, { key: 'other' })]),
    })
    const wrapper = await mountSuspended(Host, { global: { stubs: { TresCanvas: true } }, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    await nextTick()
    inView(true)
    await nextTick()
    const vm = card(wrapper)
    expect(vm.state.mode).toBe('playing')
    await takeOut(wrapper, 'Wired 3')
    expect(vm.state.mode).toBe('detail')

    shown.value = false
    await nextTick()
    await nextTick()
    expect(vm.state.mode).toBe('manual')
    expect(vm.ctx.visible.value).toBe(false)
    expect(vm.state.visible).toBe(false)

    shown.value = true
    await nextTick()
    await nextTick()
    // A new visit: in view again, it plays once more (it was Manual when left).
    inView(true)
    await nextTick()
    expect(vm.state.mode).toBe('playing')
    expect(vm.ctx.visible.value).toBe(true)
  })
})

describe('takeovers', () => {
  it('a sideways swipe: Manual at the slop, follows the finger, snaps to a Book', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, 400)
    expect(attr(wrapper, 'data-mode')).toBe('playing')
    const view = wrapper.find('.reel-card__view').element
    pointer('pointerdown', 300, view)
    pointer('pointermove', 296)
    await nextTick()
    // Inside the slop (8 px): still playing.
    expect(attr(wrapper, 'data-mode')).toBe('playing')
    pointer('pointermove', 250)
    await nextTick()
    expect(attr(wrapper, 'data-mode')).toBe('manual')
    expect(wrapper.emitted('manual')).toHaveLength(1)
    const caught = card(wrapper).ctx.focus.value
    pointer('pointermove', 250 - 132)
    await nextTick()
    // One Book's width (132 px) moves the arc one Book, 1:1.
    expect(card(wrapper).ctx.focus.value - caught).toBeCloseTo(1, 1)
    pointer('pointerup', 250 - 132)
    await frames(wrapper, 1200)
    const state = card(wrapper).state
    expect(state.glide).toBeNull()
    expect(Number.isInteger(state.focus)).toBe(true)
    expect(wrapper.emitted('manual')).toHaveLength(1)
  })

  it('a tap on a neighbour brings it to the front (eased), a takeover', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, REEL_BEAT)
    const front = Number(attr(wrapper, 'data-front'))
    card(wrapper).ctx.tap((front + 1) % 6)
    await nextTick()
    expect(attr(wrapper, 'data-mode')).toBe('manual')
    expect(wrapper.emitted('manual')).toHaveLength(1)
    // Eased, not a jump: it is still on its way a moment later.
    await frames(wrapper, 100)
    const between = card(wrapper).ctx.focus.value
    expect(between % 1).not.toBe(0)
    await frames(wrapper, 900)
    expect(attr(wrapper, 'data-front')).toBe(String((front + 1) % 6))
  })

  it('a tap beside the Books while it plays stops it; Play plays on from the Book in front, a beat at a time', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, 500)
    card(wrapper).ctx.tap(-1)
    await nextTick()
    expect(attr(wrapper, 'data-mode')).toBe('manual')
    const front = Number(attr(wrapper, 'data-front'))
    await wrapper.find('.reel-card__pause').trigger('click')
    expect(attr(wrapper, 'data-mode')).toBe('playing')
    await frames(wrapper, REEL_BEAT)
    expect(Number(attr(wrapper, 'data-front'))).toBe((front + 1) % 6)
    await wrapper.find('.reel-card__pause').trigger('click')
    expect(attr(wrapper, 'data-mode')).toBe('manual')
    expect(wrapper.emitted('manual')).toHaveLength(2)
  })

  it('a tap on the Book in front while it plays takes it out', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, REEL_BEAT + 1000)
    const front = Number(attr(wrapper, 'data-front'))
    card(wrapper).ctx.tap(front)
    await nextTick()
    await nextTick()
    expect(attr(wrapper, 'data-mode')).toBe('detail')
    expect(attr(wrapper, 'data-picked')).toBe(`fx-wire-${front + 1}`)
  })
})

describe('the history entry of a Book out', () => {
  it('Back puts the Book back into the reel', async () => {
    const wrapper = await mountReel({ autoplay: false })
    await takeOut(wrapper, 'Wired 2')
    expect(history.state?.regalReelPick).toBe(true)
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    await nextTick()
    expect(attr(wrapper, 'data-picked')).toBe('')
    expect(attr(wrapper, 'data-mode')).toBe('manual')
  })

  it('Open book tells the host only once its entry is gone', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const wrapper = await mountReel({ autoplay: false })
    await takeOut(wrapper, 'Wired 4')
    const open = [...document.body.querySelectorAll<HTMLButtonElement>('.reel-card__details button')].find(button => button.textContent?.includes('Open book'))!
    open.click()
    await nextTick()
    expect(back).toHaveBeenCalledTimes(1)
    expect(attr(wrapper, 'data-picked')).toBe('')
    expect(wrapper.emitted('open')).toBeUndefined()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    await nextTick()
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect((wrapper.emitted('open')![0]![0] as { id: string }).id).toBe('fx-wire-4')
  })

  it('unmounted with a Book out, it takes its entry back', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const wrapper = await mountReel({ autoplay: false })
    await takeOut(wrapper, 'Wired 1')
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(back).toHaveBeenCalledTimes(1)
  })
})

describe('rests', () => {
  it('off screen it rests where it is and goes on once back; nothing is drawn meanwhile', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, 1000)
    const vm = card(wrapper)
    const elapsed = vm.state.elapsed
    expect(vm.ctx.visible.value).toBe(true)
    inView(false)
    await nextTick()
    expect(vm.ctx.visible.value).toBe(false)
    await frames(wrapper, 5000)
    expect(vm.state.mode).toBe('playing')
    expect(vm.state.elapsed).toBe(elapsed)
    expect(wrapper.find('.reel-card__pause').attributes('aria-label')).toBe('Pause')
    inView(true)
    await frames(wrapper, 500)
    expect(vm.state.elapsed).toBeGreaterThan(elapsed)
  })

  it('in a hidden tab it rests too', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, 500)
    const vm = card(wrapper)
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(vm.ctx.visible.value).toBe(false)
    const elapsed = vm.state.elapsed
    await frames(wrapper, 2000)
    expect(vm.state.elapsed).toBe(elapsed)
    hidden.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await frames(wrapper, 500)
    expect(vm.state.elapsed).toBeGreaterThan(elapsed)
  })

  it('Reduce Motion switched on while it plays: Manual, no pause button, a swipe snaps without a glide', async () => {
    const wrapper = await mountReel()
    inView(true)
    await frames(wrapper, 1000)
    expect(attr(wrapper, 'data-mode')).toBe('playing')
    setReduceMotion(true)
    await nextTick()
    await nextTick()
    expect(attr(wrapper, 'data-mode')).toBe('manual')
    expect(wrapper.find('.reel-card__pause').exists()).toBe(false)
    const view = wrapper.find('.reel-card__view').element
    pointer('pointerdown', 300, view)
    pointer('pointermove', 260)
    pointer('pointermove', 200)
    pointer('pointerup', 200)
    await nextTick()
    expect(card(wrapper).state.glide).toBeNull()
    expect(Number.isInteger(card(wrapper).state.focus)).toBe(true)
  })
})
