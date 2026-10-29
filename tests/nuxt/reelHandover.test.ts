// The reel's loading state (components/reel/Poster.vue, Card.vue) and its still
// (RegalBooksReelStill): before the canvas has taken over the reel draws its own first
// frame, the Books where the canvas will draw them; the canvas fades in over it
// (`ready`), and only after that does the poster go and the clock run, so the intro starts
// from the very frame the poster showed. The 3D (TresCanvas) is stubbed, as in
// reelWiring.test.ts; the canvas's first frame is `ctx.ready()`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { ReelCard, RegalBooksReel, RegalBooksReelStill } from '#components'
import { useState } from '#imports'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { ReelContext } from '#layers/regal/app/utils/reel/context'
import type { ReelState } from '#layers/regal/app/utils/reel/state'
import { reelStartFrame } from '#layers/regal/app/utils/reel/state'
import { posterBooks, posterWorldTransform } from '#layers/regal/app/utils/reel/poster'
import { reelCamera } from '#layers/regal/app/utils/reel/layout'
import { REEL_BEAT, REEL_OPENING_HOLD } from '#layers/regal/app/utils/reel/timeline'
import { planReelEntrance } from '#layers/regal/app/utils/reel/entrance'

function libraryOf(count: number): RegalLibraryFile {
  return {
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    books: Array.from({ length: count }, (_, index) => ({
      id: `fx-hand-${index + 1}`,
      title: `Handover ${index + 1}`,
      authors: ['Ada Example'],
      status: 'read',
      rating: 0,
      assets: { color: '#336699' },
    })),
  }
}

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
  disconnect() {}
  takeRecords() {
    return []
  }
}
function inView() {
  for (const { callback, element } of [...observers]) {
    if (!element?.classList.contains('reel-card')) continue
    const rect = { height: 400, width: 390, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0 }
    callback([{ isIntersecting: true, intersectionRatio: 1, intersectionRect: rect, target: element } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
  }
}

type CardVm = { ctx: ReelContext, state: ReelState, handed: boolean, posterOn: boolean }
const mounted: VueWrapper[] = []
async function mountReel(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(RegalBooksReel, {
    // 'none': the first frame stands in place (the poster), the first look of #91; the default entrance has no poster (below).
    props: { library: libraryOf(6), entrance: 'none', ...props } as never,
    global: { stubs: { TresCanvas: true } },
    attachTo: document.body,
  }) as VueWrapper
  mounted.push(wrapper)
  await nextTick()
  return wrapper
}
const card = (wrapper: VueWrapper) => wrapper.findComponent(ReelCard).vm as unknown as CardVm
let clock = 0
async function frames(wrapper: VueWrapper, ms: number) {
  const { ctx } = card(wrapper)
  for (let t = 0; t < ms; t += 16) {
    clock += 16
    ctx.tick(16, clock)
  }
  await nextTick()
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/** What a poster draws: the world's transform and each Book's (by id, in the DOM's order). */
function drawn(wrapper: VueWrapper) {
  const poster = wrapper.find('[data-reel-poster]')
  return {
    world: poster.find('.reel-poster__world').attributes('style'),
    books: poster.findAll('[data-book]').map(book => ({ id: book.attributes('data-book'), style: book.attributes('style') })),
  }
}

beforeEach(() => {
  observers.length = 0
  clock = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  useState('book-pick').value = { bookId: null, face: 'front' }
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the poster before the canvas', () => {
  it('is the reel\'s first frame: the layout\'s Books at the starting focus, the camera at its starting clock', async () => {
    const wrapper = await mountReel()
    const { focus, dolly } = reelStartFrame(6)
    const expected = posterBooks(6, focus)
    const { world, books } = drawn(wrapper)
    expect(focus).toBe(0)
    expect(books.map(book => book.id)).toEqual(expected.map(book => `fx-hand-${book.index + 1}`))
    expect(books.map(book => book.style)).toEqual(expect.arrayContaining(expected.map(book => expect.stringContaining(book.transform))))
    expect(world).toContain(posterWorldTransform(reelCamera(dolly)))
    // The caption under it is the front Book's, as the canvas will show it.
    expect(wrapper.find('.reel-caption__title').text()).toBe('Handover 1')
    // The first Book in front, its dot lit: the same as the canvas starts on, in every mode.
    expect(wrapper.find('.reel-card').attributes('data-front')).toBe('0')
    expect(wrapper.findAll('.reel-card__dot').map(dot => dot.classes('reel-card__dot--on'))).toEqual([true, false, false, false, false, false])
  })

  it('starts the canvas on the same front Book: the caption and dots do not change when the clock starts', async () => {
    const wrapper = await mountReel()
    inView()
    await nextTick()
    const caption = () => wrapper.find('.reel-caption__title').text()
    const lit = () => wrapper.findAll('.reel-card__dot').findIndex(dot => dot.classes('reel-card__dot--on'))
    expect(card(wrapper).state.mode).toBe('playing')
    expect([caption(), lit(), wrapper.find('.reel-card').attributes('data-front')]).toEqual(['Handover 1', 0, '0'])
    card(wrapper).ctx.ready()
    await frames(wrapper, 100)
    await sleep(340)
    await frames(wrapper, 16)
    // Playing from the first frame: Book 0 stays, caption and dot, for its whole hold (the lead)...
    expect([caption(), lit(), wrapper.find('.reel-card').attributes('data-front')]).toEqual(['Handover 1', 0, '0'])
    await frames(wrapper, REEL_OPENING_HOLD - 400)
    expect(card(wrapper).ctx.focus.value).toBe(0)
    expect([caption(), lit()]).toEqual(['Handover 1', 0])
    // ... then the arc moves on and the second Book's caption is in (while the captions are out).
    await frames(wrapper, 600)
    expect(card(wrapper).ctx.focus.value).toBeGreaterThan(0)
    expect([caption(), lit()]).toEqual(['Handover 2', 1])
  })

  it('holds the clock: the beat does not move the arc under the poster, even in view and ticking', async () => {
    const wrapper = await mountReel()
    const before = drawn(wrapper)
    inView()
    await nextTick()
    const vm = card(wrapper)
    expect(vm.state.mode).toBe('playing')
    await frames(wrapper, REEL_BEAT)
    expect(vm.state.elapsed).toBe(0)
    expect(drawn(wrapper)).toEqual(before)
    expect(wrapper.emitted('ready')).toBeUndefined()
  })

  it('goes with the canvas\'s fade-in; then the clock runs from the frame it showed', async () => {
    const wrapper = await mountReel()
    inView()
    await nextTick()
    const vm = card(wrapper)
    const first = vm.ctx.focus.value
    vm.ctx.ready()
    await nextTick()
    // `ready` is told at once; the canvas fades in over the poster, which stays until it is done.
    expect(wrapper.emitted('ready')).toHaveLength(1)
    expect(wrapper.find('.reel-card').classes()).toContain('reel-card--ready')
    expect(wrapper.find('[data-reel-poster]').exists()).toBe(true)
    await frames(wrapper, 400)
    expect(vm.state.elapsed).toBe(0)
    await sleep(340)
    await nextTick()
    expect(wrapper.find('[data-reel-poster]').exists()).toBe(false)
    expect(vm.handed).toBe(true)
    // The clock runs from the poster's frame; the first Book is held (its whole beat) and then the first move.
    expect(first).toBe(0)
    await frames(wrapper, 100)
    expect(vm.state.elapsed).toBeGreaterThan(0)
    expect(vm.ctx.focus.value).toBe(first)
    await frames(wrapper, REEL_OPENING_HOLD)
    expect(vm.ctx.focus.value).toBeGreaterThan(first)
  })

  it('follows the reader\'s hand before the handover, so the canvas takes over the arc as it stands', async () => {
    const wrapper = await mountReel()
    const before = drawn(wrapper)
    await wrapper.find('.reel-card__stage').trigger('keydown', { key: 'ArrowRight' })
    // The jump eases over 0.8 s, as the canvas shows it (its frames run before it is shown).
    await frames(wrapper, 900)
    const after = drawn(wrapper)
    expect(after).not.toEqual(before)
    expect(after.books.map(book => book.id)).toEqual(posterBooks(6, 1).map(book => `fx-hand-${book.index + 1}`))
  })

  it('is not drawn with `poster` off: nothing under the canvas, the clock held all the same', async () => {
    const wrapper = await mountReel({ poster: false })
    expect(wrapper.find('[data-reel-poster]').exists()).toBe(false)
    inView()
    await frames(wrapper, 500)
    expect(card(wrapper).state.elapsed).toBe(0)
  })

  it('still (autoplay off): the first Book in front, the camera at rest', async () => {
    const wrapper = await mountReel({ autoplay: false })
    const { world, books } = drawn(wrapper)
    expect(books.map(book => book.id)).toEqual(['fx-hand-1', 'fx-hand-2', 'fx-hand-3', 'fx-hand-5', 'fx-hand-6'])
    expect(world).toContain('translateZ(-22px) rotateY(0deg)')
  })

  it('mounts the 3D late with `canvas-delay` (to look at the poster), and says nothing till it is up', async () => {
    const wrapper = await mountReel({ canvasDelay: 150 })
    const vm = card(wrapper) as unknown as { canvasUp: boolean }
    expect(vm.canvasUp).toBe(false)
    await sleep(60)
    expect(vm.canvasUp).toBe(false)
    await sleep(160)
    expect(vm.canvasUp).toBe(true)
  })
})

describe('Reduce Motion, a new Library, the controls', () => {
  it('learning Reduce Motion after mount rests the camera and keeps the arc: poster, still and canvas agree', async () => {
    const wrapper = await mountReel({ library: libraryOf(3), reducedMotion: false })
    // Three Books: an arc with ends, the clock at its second beat (the dolly 3200 ms in).
    expect(drawn(wrapper).world).not.toContain('rotateY(0deg)')
    await wrapper.setProps({ reducedMotion: true })
    await nextTick()
    const vm = card(wrapper)
    expect(drawn(wrapper).world).toContain(posterWorldTransform(reelCamera(0)))
    // What a reel that knew from the start draws, and what the still draws.
    const known = await mountReel({ library: libraryOf(3), reducedMotion: true })
    expect(drawn(wrapper)).toEqual(drawn(known))
    const still = await mountSuspended(RegalBooksReelStill, { props: { library: libraryOf(3), reducedMotion: true } as never, attachTo: document.body }) as VueWrapper
    mounted.push(still)
    expect(drawn(still)).toEqual(drawn(wrapper))
    expect(vm.state.mode).toBe('manual')
  })

  it('a new Library starts from its own first frame: the focus and the camera\'s clock', async () => {
    // One Book doesn't play: the camera at rest; Books to play do: the clock at its first beat.
    const wrapper = await mountReel({ library: libraryOf(1) })
    const vm = card(wrapper)
    expect(vm.ctx.dolly.value).toBe(0)
    await wrapper.setProps({ library: libraryOf(6) })
    await nextTick()
    expect(vm.ctx.dolly.value).toBe(REEL_BEAT)
    expect(drawn(wrapper).world).toContain(posterWorldTransform(reelCamera(REEL_BEAT)))
    expect(drawn(wrapper).books.map(book => book.id)).toEqual(posterBooks(6, 0).map(book => `fx-hand-${book.index + 1}`))
  })

  it('the pause button and dots are inert until the canvas has taken over and the clock runs (never, without the 3D)', async () => {
    const wrapper = await mountReel()
    const controls = wrapper.find('.reel-card__controls')
    expect(controls.attributes('inert')).toBeDefined()
    await sleep(60)
    expect(controls.attributes('inert')).toBeDefined()
    card(wrapper).ctx.ready()
    await sleep(340)
    await nextTick()
    expect(controls.attributes('inert')).toBeUndefined()
  })
})

describe('a Book without a Cover', () => {
  const withFront = (front: string): RegalLibraryFile => ({
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    books: [{ id: 'fx-cover-1', title: 'Covered', authors: ['Ada Example'], status: 'read', rating: 0, assets: { color: '#336699', front } }],
  })

  it('shows the title block the canvas draws, on its colour', async () => {
    const wrapper = await mountReel()
    const front = wrapper.find('[data-book="fx-hand-1"] .reel-poster__front')
    expect(front.find('img').exists()).toBe(false)
    expect(front.find('.reel-poster__title-text').text()).toBe('Handover 1')
    expect(front.find('.reel-poster__title-author').text()).toBe('Ada Example')
    expect(front.attributes('style')).toContain('background-color')
  })

  it('shows the Cover while it is there, the title block when the image fails', async () => {
    // The test DOM has no image decoder: an image that has size is one that loaded.
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(100)
    const wrapper = await mountReel({ library: withFront('http://localhost/never.jpg'), autoplay: false })
    const front = () => wrapper.find('[data-book="fx-cover-1"] .reel-poster__front')
    expect(front().find('img').exists()).toBe(true)
    expect(front().find('.reel-poster__title').exists()).toBe(false)
    await front().find('img').trigger('error')
    await nextTick()
    expect(front().find('img').exists()).toBe(false)
    expect(front().find('.reel-poster__title-text').text()).toBe('Covered')
  })
})

describe('the default entrance (\'pop\', the Stack\'s)', () => {
  it('draws no poster: the stage is quiet until the canvas has taken over', async () => {
    const wrapper = await mountReel({ entrance: 'pop' })
    expect(wrapper.find('[data-reel-poster]').exists()).toBe(false)
    expect(wrapper.find('.reel-card__stage').exists()).toBe(true)
    expect(wrapper.find('.reel-card__view').classes()).toContain('reel-card__view--still')
  })

  it('starts the Books at once when the canvas takes over, and runs the clock only once they are home', async () => {
    const wrapper = await mountReel({ entrance: 'pop' })
    inView()
    await nextTick()
    const vm = card(wrapper) as unknown as CardVm & { ctx: ReelContext }
    expect(vm.ctx.entrance).toMatchObject({ mode: 'pop', startedAt: -1, done: false })
    // The 3D plans the entrance on its first frame (stubbed here): the Stack's, 0.75 s for five Books.
    vm.ctx.entrance.plan = planReelEntrance('pop', posterBooks(6, 0).map(book => ({ index: book.index, x: book.pose.x })))
    await frames(wrapper, REEL_BEAT)
    expect(vm.state.elapsed).toBe(0)
    // The Covers came late (the 600 ms cap): the canvas takes over only now.
    await sleep(700)
    vm.ctx.ready()
    await nextTick()
    // No fade, no poster to wait for: the Books are on their way this tick.
    expect(vm.ctx.entrance.startedAt).toBe(clock)
    expect(vm.handed).toBe(false)
    expect(wrapper.find('.reel-card__controls').attributes('inert')).toBeDefined()
    // The clock waits for the Books to land, however long that takes (ReelBooks marks it done): not for a timer.
    await frames(wrapper, 2000)
    expect(vm.handed).toBe(false)
    expect(vm.state.elapsed).toBe(0)
    vm.ctx.entrance.done = true
    await frames(wrapper, 100)
    // Then a short breath, and the first Book's whole beat starts.
    expect(vm.handed).toBe(false)
    await frames(wrapper, 300)
    expect(vm.handed).toBe(true)
    expect(wrapper.find('.reel-controls, .reel-card__controls').attributes('inert')).toBeUndefined()
    const started = vm.state.elapsed
    await frames(wrapper, 100)
    expect(vm.state.elapsed).toBeGreaterThan(started)
    expect(vm.ctx.focus.value).toBe(0)
  })

  it('\'settle\' and \'none\' keep the poster, and \'settle\' starts its swell after the canvas has faded in', async () => {
    const settle = await mountReel({ entrance: 'settle' })
    expect(settle.find('[data-reel-poster]').exists()).toBe(true)
    const vm = card(settle) as unknown as CardVm
    vm.ctx.ready()
    await sleep(60)
    expect(vm.ctx.entrance.startedAt).toBe(-1)
    await sleep(300)
    expect(vm.ctx.entrance.startedAt).toBeGreaterThanOrEqual(0)
    expect(settle.find('[data-reel-poster]').exists()).toBe(false)
    const none = await mountReel({ entrance: 'none' })
    expect(card(none).ctx.entrance.done).toBe(true)
  })

  it('Reduce Motion has no entrance: the poster stands in, the Books just show', async () => {
    const wrapper = await mountReel({ entrance: 'pop', reducedMotion: true })
    expect(wrapper.find('[data-reel-poster]').exists()).toBe(true)
    expect(card(wrapper).ctx.entrance).toMatchObject({ mode: 'none', done: true })
    // Switched on after mount: the same.
    const later = await mountReel({ entrance: 'pop', reducedMotion: false })
    expect(later.find('[data-reel-poster]').exists()).toBe(false)
    await later.setProps({ reducedMotion: true })
    await nextTick()
    expect(card(later).ctx.entrance).toMatchObject({ mode: 'none', done: true })
    expect(later.find('[data-reel-poster]').exists()).toBe(true)
  })
})

describe('the loading ring (the pop entrance\'s wait)', () => {
  it('shows only after a moment of waiting, named for assistive technology, and fades out as the Books pop in', async () => {
    const wrapper = await mountReel({ entrance: 'pop', labels: { loading: 'Bücher werden geladen' } })
    expect(wrapper.find('.reel-card__loading').exists()).toBe(false)
    await sleep(120)
    expect(wrapper.find('.reel-card__loading').exists()).toBe(false)
    await sleep(220)
    const ring = wrapper.find('.reel-card__loading')
    expect(ring.exists()).toBe(true)
    expect(ring.attributes('role')).toBe('status')
    expect(ring.text()).toBe('Bücher werden geladen')
    expect(ring.find('.reel-card__spinner').attributes('aria-hidden')).toBe('true')
    expect(ring.classes()).not.toContain('reel-card__loading--out')
    card(wrapper).ctx.ready()
    await nextTick()
    // Out with the pop: it fades, then it is gone.
    expect(wrapper.find('.reel-card__loading').classes()).toContain('reel-card__loading--out')
    await sleep(260)
    expect(wrapper.find('.reel-card__loading').exists()).toBe(false)
  })

  it('never flashes on a fast load, nor stands in the other entrances', async () => {
    const fast = await mountReel({ entrance: 'pop' })
    card(fast).ctx.ready()
    await sleep(320)
    expect(fast.find('.reel-card__loading').exists()).toBe(false)
    const poster = await mountReel({ entrance: 'none' })
    await sleep(320)
    expect(poster.find('.reel-card__loading').exists()).toBe(false)
  })

  it('has default words, and stands still (no turn) when Reduce Motion is learned while it shows; Reduce Motion known: the poster stands in, no ring', async () => {
    const wrapper = await mountReel({ entrance: 'pop', reducedMotion: false })
    await sleep(320)
    expect(wrapper.find('.reel-card__loading').text()).toBe('Loading books')
    expect(wrapper.find('.reel-card__loading').classes()).not.toContain('reel-card__loading--still')
    await wrapper.setProps({ reducedMotion: true })
    await nextTick()
    expect(wrapper.find('.reel-card__loading').classes()).toContain('reel-card__loading--still')
    // Reduce Motion: the poster stands in instead, so no ring then at all (nothing waits for an entrance).
    const reduced = await mountReel({ entrance: 'pop', reducedMotion: true })
    await sleep(320)
    expect(reduced.find('.reel-card__loading').exists()).toBe(false)
  })
})

describe('the still for a host\'s fallbacks (RegalBooksReelStill)', () => {
  async function mountStill(props: Record<string, unknown> = {}) {
    const wrapper = await mountSuspended(RegalBooksReelStill, { props: { library: libraryOf(6), ...props } as never, attachTo: document.body }) as VueWrapper
    mounted.push(wrapper)
    return wrapper
  }

  it('draws exactly what the reel\'s poster draws, with the same caption: no canvas, no pause button', async () => {
    const reel = await mountReel()
    const still = await mountStill()
    expect(drawn(still)).toEqual(drawn(reel))
    expect(still.find('.reel-caption__title').text()).toBe('Handover 1')
    expect(still.find('canvas').exists()).toBe(false)
    expect(still.find('button').exists()).toBe(false)
    expect(still.find('section').attributes('aria-label')).toBe('Books')
  })

  it('follows the reel\'s props: autoplay off and Reduce Motion rest on the first Book', async () => {
    const reel = await mountReel({ autoplay: false })
    expect(drawn(await mountStill({ autoplay: false }))).toEqual(drawn(reel))
    const reduced = await mountReel({ reducedMotion: true })
    expect(drawn(await mountStill({ reducedMotion: true }))).toEqual(drawn(reduced))
    // Reduce Motion never moves the arc (the server and the first render don't know it yet): the same frame.
    expect((await mountStill({ reducedMotion: true })).find('.reel-caption__title').text()).toBe('Handover 1')
  })

  it('takes the host\'s `#tooltip` slot, and says so when there is nothing to show', async () => {
    const wrapper = await mountSuspended(RegalBooksReelStill, {
      props: { library: libraryOf(6) } as never,
      slots: { tooltip: '<span class="host-caption">host caption</span>' },
      attachTo: document.body,
    }) as VueWrapper
    mounted.push(wrapper)
    expect(wrapper.find('.host-caption').exists()).toBe(true)
    expect(wrapper.find('.reel-caption').exists()).toBe(false)
    const empty = await mountStill({ library: { version: 2, generatedAt: '2026-10-28T00:00:00Z', books: [] } })
    expect(empty.find('[data-reel-poster]').exists()).toBe(false)
  })
})
