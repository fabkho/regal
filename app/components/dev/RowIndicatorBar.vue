<script setup lang="ts">
// 1 · Refined bar. Today's hairline, done better: a rounded track under the
// row, the thumb as wide as the share of the row the card shows (never thinner
// than a fingertip's mark), quiet at rest, awake and thicker while the row
// moves or the thumb is held, draggable. Fades at both card edges say there is
// more that way, and go when the end is reached.
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'
import { useScrollbarA11y } from '#layers/regal/app/dev/row-scrollbar/a11y'

const props = defineProps<{ state: RowIndicatorState }>()
const { attrs, onKeydown } = useScrollbarA11y(props.state, 'Scroll position')
const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
const live = computed(() => props.state.scrolling || dragging.value)
const canLeft = computed(() => props.state.progress > 0.01)
const canRight = computed(() => props.state.progress < 0.99)

/** The thumb's min width (px): the mark stays findable at 100 Books. */
const MIN_THUMB = 28
let grab = 0
function thumbPx(width: number) {
  return Math.max(MIN_THUMB, props.state.visible * width)
}
function onDown(event: PointerEvent) {
  const root = el.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  const width = rect.width
  const thumb = thumbPx(width)
  const left = props.state.progress * (width - thumb)
  const x = event.clientX - rect.left
  // On the thumb: keep where it was grabbed; elsewhere: the thumb's middle goes there.
  grab = x >= left && x <= left + thumb ? x - left : thumb / 2
  dragging.value = true
  root.setPointerCapture(event.pointerId)
  move(event)
}
function move(event: PointerEvent) {
  const root = el.value
  if (!root || !dragging.value) return
  const rect = root.getBoundingClientRect()
  const thumb = thumbPx(rect.width)
  const free = Math.max(1, rect.width - thumb)
  props.state.scrollToProgress((event.clientX - rect.left - grab) / free, false)
}
function onUp() {
  dragging.value = false
}
</script>

<template>
  <div
    class="bar"
    :class="{ 'bar--live': live, 'bar--left': canLeft, 'bar--right': canRight }"
  >
    <span
      class="bar__fade bar__fade--left"
      aria-hidden="true"
    />
    <span
      class="bar__fade bar__fade--right"
      aria-hidden="true"
    />
    <div
      ref="el"
      v-bind="attrs"
      class="bar__hit"
      @keydown="onKeydown"
      @pointerdown="onDown"
      @pointermove="move"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <span
        class="bar__track"
        aria-hidden="true"
      >
        <span
          class="bar__thumb"
          :style="{ '--p': state.progress, '--v': state.visible }"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bar__hit {
  position: absolute;
  left: var(--i-inset);
  right: var(--i-inset);
  bottom: 0;
  height: 26px;
  pointer-events: auto;
  touch-action: pan-y;
  cursor: grab;
  outline: none;
}

.bar__track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 9px;
  height: 3px;
  border-radius: 99px;
  background: var(--i-track);
  opacity: 0.6;
  transition: height 0.25s ease, opacity 0.3s ease, bottom 0.25s ease;
}

.bar__thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  width: max(calc(var(--v) * 100%), 28px);
  left: calc(var(--p) * (100% - max(calc(var(--v) * 100%), 28px)));
  border-radius: inherit;
  background: var(--i-ink);
  opacity: 0.5;
  transition: opacity 0.3s ease, background-color 0.3s ease;
}

.bar--live .bar__track {
  height: 5px;
  bottom: 8px;
  opacity: 1;
}

.bar--live .bar__thumb {
  opacity: 1;
}

.bar__hit:active .bar__thumb {
  background: var(--i-accent);
}

.bar__fade {
  position: absolute;
  top: calc(-1 * var(--i-row, 0px));
  bottom: 0;
  width: 22px;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.bar__fade--left {
  left: 0;
  background: linear-gradient(to right, var(--i-surface), transparent);
}

.bar__fade--right {
  right: 0;
  background: linear-gradient(to left, var(--i-surface), transparent);
}

.bar--left .bar__fade--left,
.bar--right .bar__fade--right {
  opacity: 0.9;
}

.ind--reduced .bar__track,
.ind--reduced .bar__thumb,
.ind--reduced .bar__fade {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .bar__track,
  .bar__thumb,
  .bar__fade {
    transition: none;
  }
}
</style>
