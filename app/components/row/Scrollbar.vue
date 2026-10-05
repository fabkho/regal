<script setup lang="ts">
// RegalBooksRow's scroll bar, under the Books: where you are and how far you
// can still scroll. A rounded thumb as wide as the share of the row the card
// shows, quiet at rest, thicker and brighter while the row moves or the thumb
// is held; soft fades at the card's edges where there is more that way. Drag
// the thumb, or press beside it to bring it there. It is a `scrollbar` for
// assistive technology (the row's own scroller keeps the keyboard: this is
// not a tab stop, but answers the arrow keys once a press focused it).
import { grabOffset, scrubProgress } from '#layers/regal/app/utils/row/scrollbar'

const props = defineProps<{
  /** Scroll position, 0..1. */
  progress: number
  /** The share of the row the card shows, 0..1. */
  share: number
  /** The row is moving (or just was). */
  scrolling: boolean
  /** The id of the scroller it controls. */
  controls: string
  /** What the position means in words ("Book 12 of 77"). */
  text?: string
  label?: string
}>()

const emit = defineEmits<{
  /** The reader moved it: the new scroll progress, 0..1. */
  scrub: [progress: number]
}>()

const hit = ref<HTMLElement | null>(null)
const dragging = ref(false)
const live = computed(() => props.scrolling || dragging.value)
const more = computed(() => ({ before: props.progress > 0.01, after: props.progress < 0.99 }))
let grab = 0

function trackOf(event: PointerEvent) {
  const rect = hit.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, width: rect.width }
}

function onDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const { x, width } = trackOf(event)
  grab = grabOffset(x, props.progress, props.share, width)
  dragging.value = true
  hit.value!.setPointerCapture(event.pointerId)
  emit('scrub', scrubProgress(x, grab, props.share, width))
}

function onMove(event: PointerEvent) {
  if (!dragging.value) return
  const { x, width } = trackOf(event)
  emit('scrub', scrubProgress(x, grab, props.share, width))
}

function onUp() {
  dragging.value = false
}

function onKeydown(event: KeyboardEvent) {
  // A page is 70 % of the card, as the ‹ › buttons scroll.
  const page = 0.7 * props.share / Math.max(0.001, 1 - props.share)
  const next: Record<string, number> = {
    ArrowLeft: props.progress - page,
    ArrowRight: props.progress + page,
    Home: 0,
    End: 1,
  }
  const value = next[event.key]
  if (value === undefined) return
  event.preventDefault()
  emit('scrub', Math.min(1, Math.max(0, value)))
}
</script>

<template>
  <div
    class="row-bar"
    :class="{ 'row-bar--live': live, 'row-bar--before': more.before, 'row-bar--after': more.after }"
  >
    <span
      class="row-bar__fade row-bar__fade--before"
      aria-hidden="true"
    />
    <span
      class="row-bar__fade row-bar__fade--after"
      aria-hidden="true"
    />
    <div
      ref="hit"
      class="row-bar__hit"
      role="scrollbar"
      aria-orientation="horizontal"
      :aria-label="label || 'Scroll position'"
      :aria-controls="controls"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
      :aria-valuetext="text || undefined"
      tabindex="-1"
      @keydown="onKeydown"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <span
        class="row-bar__track"
        aria-hidden="true"
      >
        <span
          class="row-bar__thumb"
          :style="{ '--p': progress, '--v': share }"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Over the card's bottom edge: the Books and the focus label keep their room. */
.row-bar {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.row-bar__hit {
  position: absolute;
  left: 0.9rem;
  right: 0.9rem;
  bottom: 0;
  height: 1.4rem;
  pointer-events: auto;
  /* A press here scrubs; an up/down swipe still scrolls the page. */
  touch-action: pan-y;
  cursor: grab;
  outline: none;
}

.row-bar__hit:active {
  cursor: grabbing;
}

.row-bar__track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.55rem;
  height: 3px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--_regal-ink) 14%, transparent);
  opacity: 0.6;
  transition: height 0.25s ease, bottom 0.25s ease, opacity 0.3s ease;
}

.row-bar__thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  /* The share of the track, never under 28px (SCROLLBAR_MIN_THUMB). */
  width: max(calc(var(--v) * 100%), 28px);
  left: calc(var(--p) * (100% - max(calc(var(--v) * 100%), 28px)));
  border-radius: inherit;
  background: var(--_regal-ink);
  opacity: 0.5;
  transition: opacity 0.3s ease, background-color 0.3s ease;
}

.row-bar--live .row-bar__track {
  height: 5px;
  bottom: 0.5rem;
  opacity: 1;
}

.row-bar--live .row-bar__thumb {
  opacity: 1;
}

.row-bar__hit:active .row-bar__thumb {
  background: var(--_regal-accent);
}

.row-bar__fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.4rem;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.row-bar__fade--before {
  left: 0;
  background: linear-gradient(to right, var(--regal-row-background, var(--_regal-surface)), transparent);
}

.row-bar__fade--after {
  right: 0;
  background: linear-gradient(to left, var(--regal-row-background, var(--_regal-surface)), transparent);
}

.row-bar--before .row-bar__fade--before,
.row-bar--after .row-bar__fade--after {
  opacity: 0.9;
}

@media (prefers-reduced-motion: reduce) {
  .row-bar__track,
  .row-bar__thumb,
  .row-bar__fade {
    transition: none;
  }
}
</style>
