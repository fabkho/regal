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
import { REEL_BEAT } from '#layers/regal/app/utils/reel/timeline'

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
    props: { library: libraryOf(6), ...props } as never,
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
    expect(focus).toBe(-1)
    expect(books.map(book => book.id)).toEqual(expected.map(book => `fx-hand-${book.index + 1}`))
    expect(books.map(book => book.style)).toEqual(expect.arrayContaining(expected.map(book => expect.stringContaining(book.transform))))
    expect(world).toContain(posterWorldTransform(reelCamera(dolly)))
    // The caption under it is the front Book's, as the canvas will show it.
    expect(wrapper.find('.reel-caption__title').text()).toBe('Handover 6')
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
    // The intro: the arc's first move, from the poster's frame.
    expect(first).toBe(-1)
    await frames(wrapper, 100)
    expect(vm.state.elapsed).toBeGreaterThan(0)
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
    expect(after.books.map(book => book.id)).toEqual(posterBooks(6, 0).map(book => `fx-hand-${book.index + 1}`))
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
    expect(still.find('.reel-caption__title').text()).toBe('Handover 6')
    expect(still.find('canvas').exists()).toBe(false)
    expect(still.find('button').exists()).toBe(false)
    expect(still.find('section').attributes('aria-label')).toBe('Books')
  })

  it('follows the reel\'s props: autoplay off and Reduce Motion rest on the first Book', async () => {
    const reel = await mountReel({ autoplay: false })
    expect(drawn(await mountStill({ autoplay: false }))).toEqual(drawn(reel))
    const reduced = await mountReel({ reducedMotion: true })
    expect(drawn(await mountStill({ reducedMotion: true }))).toEqual(drawn(reduced))
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
