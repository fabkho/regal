import type { Ref } from 'vue'

// Swapping the Book in the details card: the card stays where it is and only
// its content changes, one after the other, so no text moves while it shows:
//   1. the old content fades out, shrinking a little,
//   2. (it waits a moment for the new content to be complete: the blurb),
//   3. the card's height follows to the new content while nothing shows,
//   4. the new content fades in, growing back to full size.
// The card is anchored at its bottom on the stage, so any change of its
// height moves its top edge and the text with it: that is why the height only
// changes while the content is hidden. Height changes outside a swap (a blurb
// arriving late, a spoiler shown) are followed smoothly too.

/** Old content out: fade and shrink to SWAP_SCALE. */
export const SWAP_OUT_MS = 140
/** New content in: fade and grow from SWAP_SCALE. */
export const SWAP_IN_MS = 170
export const SWAP_SCALE = 0.97
/** The card's height following its content. */
export const HEIGHT_MS = 200
/** Longest a swap waits (from the click) for the new content to be complete. */
export const SWAP_READY_MS = 300

const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'
const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)'
const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const settled = (animation: Animation) => animation.finished.then(() => undefined, () => undefined)

/**
 * Drives a card whose content shows `source` (the picked Book). Returns
 * `shown`, what the content should render: the old Book until it has faded
 * out, then the new one. `card` is the element whose height follows, `body`
 * the content's box (watched for size changes), `content` what fades.
 */
export function useCardSwap<T extends { id: string }>(options: {
  source: Ref<T | null>
  card: Ref<HTMLElement | null>
  body: Ref<HTMLElement | null>
  content: Ref<HTMLElement | null>
  /** Swap at once (reduced motion, or the card is hidden while the label morph runs). */
  instant: () => boolean
  /** Resolves when the new content is complete (waited for at most SWAP_READY_MS). */
  ready?: (next: T) => Promise<unknown>
}) {
  const holding = shallowRef<T | null>(null)
  const shown = computed(() => holding.value ?? options.source.value)

  // --- Height follow --------------------------------------------------------

  let naturalHeight = 0
  let heightAnimation: Animation | null = null
  let onResized: (() => void) | null = null

  function followHeight() {
    const element = options.card.value
    if (!element) return
    // Where the card is drawn now (mid-animation too), then where its content puts it.
    const from = heightAnimation ? element.getBoundingClientRect().height : naturalHeight
    heightAnimation?.cancel()
    heightAnimation = null
    const to = element.getBoundingClientRect().height
    const first = !naturalHeight
    naturalHeight = to
    if (first || options.instant() || Math.abs(from - to) < 1) {
      element.style.overflow = ''
      return
    }
    element.style.overflow = 'hidden'
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: HEIGHT_MS, easing: EASE_IN_OUT })
    heightAnimation = animation
    void settled(animation).then(() => {
      if (heightAnimation !== animation) return
      heightAnimation = null
      element.style.overflow = ''
    })
  }

  useResizeObserver(options.body, () => {
    followHeight()
    onResized?.()
  })

  watch(options.card, (element) => {
    if (element) return
    heightAnimation?.cancel()
    heightAnimation = null
    naturalHeight = 0
  })

  /** The next layout of the content: its resize (or two frames when its size didn't change). */
  function nextLayout() {
    return new Promise<void>((resolve) => {
      const done = () => {
        if (onResized === done) onResized = null
        resolve()
      }
      onResized = done
      requestAnimationFrame(() => requestAnimationFrame(done))
    })
  }

  async function heightSettled() {
    while (heightAnimation) await settled(heightAnimation)
  }

  // --- Content ----------------------------------------------------------------

  let contentAnimation: Animation | null = null

  /** Fades the content in or out from wherever it is now (a swap can interrupt a swap). */
  function fadeContent(visible: boolean): Promise<void> {
    const element = options.content.value
    if (!element) return Promise.resolve()
    const style = getComputedStyle(element)
    const from = { opacity: style.opacity, transform: style.transform === 'none' ? 'scale(1)' : style.transform }
    const to = visible ? { opacity: '1', transform: 'scale(1)' } : { opacity: '0', transform: `scale(${SWAP_SCALE})` }
    contentAnimation?.cancel()
    const animation = element.animate([from, to], {
      duration: visible ? SWAP_IN_MS : SWAP_OUT_MS,
      easing: visible ? EASE_OUT : EASE_IN,
      fill: 'forwards',
    })
    contentAnimation = animation
    return settled(animation)
  }

  function resetContent() {
    contentAnimation?.cancel()
    contentAnimation = null
  }

  let run = 0

  async function swap(previous: T, next: T) {
    const id = ++run
    const started = performance.now()
    // Keep showing what is on screen until it has gone.
    if (!holding.value) holding.value = previous
    await fadeContent(false)
    if (id !== run) return
    const wait = SWAP_READY_MS - (performance.now() - started)
    if (options.ready && wait > 0) await Promise.race([options.ready(next), sleep(wait)])
    if (id !== run) return
    holding.value = null
    await nextTick()
    await nextLayout()
    await heightSettled()
    if (id !== run) return
    await fadeContent(true)
    if (id === run) resetContent()
  }

  watch(options.source, (next, previous) => {
    if (next && previous && next.id !== previous.id && options.card.value && !options.instant()) {
      void swap(previous, next)
      return
    }
    run++
    holding.value = null
    resetContent()
  })

  return { shown }
}
