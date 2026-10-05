<script setup lang="ts">
// 4 · Colour minimap. The whole row as a strip of slivers, one per Book, as
// wide as its Spine is thick and as tall as the Book, in the Spine's own
// colour (the library file's `spineColor`, else the cover cloth). A frame
// shows what the card shows; what is outside is dimmed. Press anywhere to
// bring the frame there (smooth on a tap), drag the frame to scrub. It shows
// where you are, how far there is to go, and what the shelf looks like.
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'
import { useScrollbarA11y } from '#layers/regal/app/dev/row-scrollbar/a11y'

const props = defineProps<{ state: RowIndicatorState }>()
const { attrs, onKeydown } = useScrollbarA11y(props.state, 'Minimap of the row')
const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
const live = computed(() => props.state.scrolling || dragging.value)
const inFrame = (from: number, to: number) => to >= props.state.windowFrom && from <= props.state.windowTo

let grab = 0
let startX = 0
let moved = false
function fraction(event: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}
/** Brings the frame's middle to track position `at` (0..1). */
function centre(at: number, smooth: boolean) {
  props.state.scrollToLeft(at * props.state.scrollWidth - props.state.clientWidth / 2, smooth)
}
function onDown(event: PointerEvent) {
  const at = fraction(event)
  const { windowFrom, windowTo } = props.state
  // Held inside the frame: it keeps its place under the finger. Outside: it jumps there.
  grab = at >= windowFrom && at <= windowTo ? at - (windowFrom + windowTo) / 2 : 0
  startX = event.clientX
  moved = false
  dragging.value = true
  props.state.hold(true)
  el.value?.setPointerCapture(event.pointerId)
  if (grab !== 0) return
  // A tap beside the frame moves it there smoothly; a drag from there scrubs.
  centre(at, true)
}
function onMove(event: PointerEvent) {
  if (!dragging.value) return
  if (!moved && Math.abs(event.clientX - startX) < 3) return
  moved = true
  centre(fraction(event) - grab, false)
}
function onUp() {
  dragging.value = false
  props.state.hold(false)
}
</script>

<template>
  <div
    class="map"
    :class="{ 'map--live': live, 'map--drag': dragging }"
  >
    <div
      ref="el"
      v-bind="attrs"
      class="map__strip"
      @keydown="onKeydown"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <span
        v-for="book in state.books"
        :key="book.id"
        class="map__book"
        :class="{ 'map__book--in': inFrame(book.from, book.to) }"
        aria-hidden="true"
        :style="{
          left: `${book.from * 100}%`,
          width: `${(book.to - book.from) * 100}%`,
          height: `${48 + book.height * 52}%`,
          background: book.color,
        }"
      />
      <span
        class="map__frame"
        aria-hidden="true"
        :style="{ left: `${state.windowFrom * 100}%`, width: `${(state.windowTo - state.windowFrom) * 100}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.map {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.map__strip {
  position: absolute;
  left: var(--i-inset);
  right: var(--i-inset);
  bottom: 9px;
  height: 22px;
  pointer-events: auto;
  touch-action: pan-y;
  cursor: pointer;
  outline: none;
}

/* A fingertip-sized target around a thin strip. */
.map__strip::before {
  content: '';
  position: absolute;
  inset: -8px -6px -8px;
}

.map__book {
  position: absolute;
  bottom: 0;
  min-width: 1px;
  border-radius: 1px 1px 0 0;
  opacity: 0.55;
  box-shadow: inset -0.5px 0 0 var(--i-surface);
  transition: opacity 0.3s ease;
}

.map__book--in {
  opacity: 1;
}

.map__frame {
  position: absolute;
  top: -3px;
  bottom: -3px;
  box-sizing: border-box;
  border: 1.5px solid var(--i-ink);
  border-radius: 5px;
  box-shadow: 0 0 0 1px var(--i-surface), inset 0 0 0 1px var(--i-surface);
  opacity: 0.75;
  transition: opacity 0.3s ease, border-color 0.2s ease;
}

.map--live .map__frame {
  opacity: 1;
}

.map--drag .map__frame {
  border-color: var(--i-accent);
}

.ind--reduced .map__book,
.ind--reduced .map__frame {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .map__book,
  .map__frame {
    transition: none;
  }
}
</style>
