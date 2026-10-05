<script setup lang="ts">
// 5 · Years and count (my own idea). A readout, "BOOK 12 / 77" and the month,
// over a hairline cut into one segment per year, as wide as that year's
// stretch of the row, filled like story bars: years behind you full, the
// year you are in filling as you go, years ahead empty. The years are
// written under it. Tap a year to go to its start, drag to scrub. The only
// variant that says how many Books there are.
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'
import { useScrollbarA11y } from '#layers/regal/app/dev/row-scrollbar/a11y'

const props = defineProps<{ state: RowIndicatorState }>()
const { attrs, onKeydown } = useScrollbarA11y(props.state, 'Years')
const el = ref<HTMLElement | null>(null)
const { width } = useElementSize(el)
const dragging = ref(false)
const live = computed(() => props.state.scrolling || dragging.value)

const GAP = 3
const segments = computed(() => props.state.years.map((year) => {
  const span = Math.max(1e-6, year.to - year.at)
  const fill = Math.min(1, Math.max(0, (props.state.reading - year.at) / span))
  return { ...year, fill, current: props.state.reading >= year.at && props.state.reading < year.to + 1e-6 }
}))
const currentYear = computed(() => segments.value.findLast(segment => segment.current) ?? segments.value[0])

/** A year's name shows where its segment is wide enough for it. */
const roomFor = (from: number, to: number) => (to - from) * width.value >= 30

let startX = 0
let moved = false
function fraction(event: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}
function yearAt(at: number) {
  return props.state.years.findLast(year => year.at <= at + 1e-6) ?? props.state.years[0]
}
function onDown(event: PointerEvent) {
  startX = event.clientX
  moved = false
  dragging.value = true
  props.state.hold(true)
  el.value?.setPointerCapture(event.pointerId)
}
function onMove(event: PointerEvent) {
  if (!dragging.value) return
  if (!moved && Math.abs(event.clientX - startX) < 4) return
  moved = true
  props.state.scrollToTrack(fraction(event), false)
}
function onUp(event: PointerEvent) {
  if (!dragging.value) return
  const year = yearAt(fraction(event))
  // A tap goes to the start of that year (its first Book to the middle).
  if (!moved && year) props.state.scrollToTrack(year.at + 0.001, true)
  dragging.value = false
  props.state.hold(false)
}
</script>

<template>
  <div
    class="years"
    :class="{ 'years--live': live, 'years--drag': dragging }"
  >
    <div
      ref="el"
      v-bind="attrs"
      class="years__hit"
      @keydown="onKeydown"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <p
        class="years__readout"
        aria-hidden="true"
      >
        <span><b>{{ state.bookIndex + 1 }}</b> / {{ state.total }}</span>
        <span>{{ state.month?.label }}</span>
      </p>
      <div
        class="years__bars"
        aria-hidden="true"
      >
        <span
          v-for="segment in segments"
          :key="segment.label"
          class="years__seg"
          :class="{ 'years__seg--now': segment === currentYear }"
          :style="{ left: `${segment.at * 100}%`, width: `calc(${(segment.to - segment.at) * 100}% - ${GAP}px)` }"
        >
          <i :style="{ width: `${segment.fill * 100}%` }" />
        </span>
      </div>
      <div
        class="years__names"
        aria-hidden="true"
      >
        <span
          v-for="segment in segments"
          :key="segment.label"
          class="years__name"
          :class="{ 'years__name--now': segment === currentYear }"
          :style="{ left: `${segment.at * 100}%` }"
        >{{ roomFor(segment.at, segment.to) ? segment.label : '' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.years {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.years__hit {
  position: absolute;
  left: var(--i-inset);
  right: var(--i-inset);
  bottom: 4px;
  height: 44px;
  pointer-events: auto;
  touch-action: pan-y;
  cursor: pointer;
  outline: none;
}

.years__readout {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font: var(--i-label-weight) var(--i-label-size) / 1 var(--i-font);
  letter-spacing: var(--i-tracking);
  text-transform: var(--i-case);
  color: var(--i-faint);
}

.years__readout b {
  font-weight: 600;
  color: var(--i-ink);
}

.years__bars {
  position: absolute;
  left: 0;
  right: 0;
  top: 17px;
  height: 4px;
}

.years__seg {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 99px;
  background: var(--i-track);
  transition: height 0.25s ease;
}

.years__seg i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--i-ink);
  opacity: 0.5;
}

.years__seg--now i {
  background: var(--i-accent);
  opacity: 1;
}

.years--live .years__seg i {
  opacity: 0.8;
}

.years--drag .years__seg {
  height: 6px;
  margin-top: -1px;
}

.years__names {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 10px;
}

.years__name {
  position: absolute;
  bottom: 0;
  font: var(--i-label-weight) 0.56rem / 1 var(--i-font);
  letter-spacing: 0.04em;
  color: var(--i-faint);
  opacity: 0.8;
  transition: color 0.3s ease;
}

.years__name--now {
  color: var(--i-ink);
  opacity: 1;
}

.ind--reduced .years__seg,
.ind--reduced .years__name {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .years__seg,
  .years__name {
    transition: none;
  }
}
</style>
