<script setup lang="ts">
// 3 · Month ticks. One tick per month along the row (as the row lays them
// out: a month with more Books is wider), taller where a year begins, years
// written under them where there is room. The window the card shows is a band
// over the ticks; the month in the middle is the accent tick and is named
// above, following the row. Tap a tick to jump to that month, drag along it to
// scrub (the name grows while held). It is the row's index as well as its
// position.
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'
import { useScrollbarA11y } from '#layers/regal/app/dev/row-scrollbar/a11y'

const props = defineProps<{ state: RowIndicatorState }>()
const { attrs, onKeydown } = useScrollbarA11y(props.state, 'Months')
const el = ref<HTMLElement | null>(null)
const { width } = useElementSize(el)
const dragging = ref(false)
const live = computed(() => props.state.scrolling || dragging.value)

/** Years worth a label: the new-year ticks with room (px) after the last label. */
const yearLabels = computed(() => {
  const out: { key: string, text: string, at: number }[] = []
  let lastRight = -Infinity
  for (const month of props.state.months) {
    if (!month.newYear || month.year === null) continue
    const left = month.at * width.value
    if (left < lastRight + 6) continue
    // "'25": two digits where it is tight, else the year.
    out.push({ key: month.key, text: String(month.year), at: month.at })
    lastRight = left + 30
  }
  return out
})

/** The name above: kept inside the card. */
const nameAt = computed(() => {
  const half = 38
  const px = props.state.reading * width.value
  return Math.min(width.value - half, Math.max(half, px))
})
const inWindow = (at: number) => at >= props.state.windowFrom - 0.0005 && at <= props.state.windowTo + 0.0005

let startX = 0
let moved = false
function fraction(event: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
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
  if (!moved) props.state.scrollToMonth(props.state.monthAt(fraction(event)))
  dragging.value = false
  props.state.hold(false)
}
</script>

<template>
  <div
    class="months"
    :class="{ 'months--live': live, 'months--drag': dragging }"
  >
    <div
      ref="el"
      v-bind="attrs"
      class="months__hit"
      @keydown="onKeydown"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <span
        class="months__name"
        aria-hidden="true"
        :style="{ left: `${nameAt}px` }"
      >{{ state.month?.label }}</span>
      <span
        class="months__band"
        aria-hidden="true"
        :style="{ left: `${state.windowFrom * 100}%`, width: `${(state.windowTo - state.windowFrom) * 100}%` }"
      />
      <span
        class="months__base"
        aria-hidden="true"
      />
      <span
        v-for="month in state.months"
        :key="month.key"
        class="months__tick"
        :class="{
          'months__tick--year': month.newYear,
          'months__tick--in': inWindow(month.at),
          'months__tick--now': month.index === state.monthIndex,
        }"
        aria-hidden="true"
        :style="{ left: `${month.at * 100}%` }"
      />
      <span
        v-for="year in yearLabels"
        :key="year.key"
        class="months__year"
        aria-hidden="true"
        :style="{ left: `${year.at * 100}%` }"
      >{{ year.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.months {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.months__hit {
  position: absolute;
  left: var(--i-inset);
  right: var(--i-inset);
  bottom: 4px;
  height: 46px;
  pointer-events: auto;
  touch-action: pan-y;
  cursor: pointer;
  outline: none;
}

.months__name {
  position: absolute;
  top: 0;
  translate: -50% 0;
  font: var(--i-label-weight) var(--i-label-size) / 1 var(--i-font);
  letter-spacing: var(--i-tracking);
  text-transform: var(--i-case);
  color: var(--i-ink);
  white-space: nowrap;
  opacity: 0.8;
  transition: opacity 0.3s ease, scale 0.2s ease;
}

.months--drag .months__name {
  scale: 1.18;
  opacity: 1;
  color: var(--i-accent);
}

.months__base {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  height: 1px;
  background: var(--i-track);
}

.months__band {
  position: absolute;
  bottom: 13px;
  height: 17px;
  border: 1px solid color-mix(in srgb, var(--i-ink) 35%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--i-ink) 7%, transparent);
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.months--live .months__band {
  border-color: color-mix(in srgb, var(--i-ink) 60%, transparent);
  background: color-mix(in srgb, var(--i-ink) 11%, transparent);
}

.months__tick {
  position: absolute;
  bottom: 14px;
  width: 1px;
  height: 6px;
  background: var(--i-faint);
  opacity: 0.55;
  transition: opacity 0.3s ease, background-color 0.3s ease;
}

.months__tick--year {
  height: 12px;
  opacity: 0.9;
}

.months__tick--in {
  background: var(--i-ink);
  opacity: 0.95;
}

.months__tick--now {
  width: 2px;
  margin-left: -0.5px;
  height: 13px;
  background: var(--i-accent);
  opacity: 1;
}

.months__year {
  position: absolute;
  bottom: 0;
  font: var(--i-label-weight) 0.56rem / 1 var(--i-font);
  letter-spacing: 0.04em;
  color: var(--i-faint);
}

.ind--reduced .months__name,
.ind--reduced .months__band,
.ind--reduced .months__tick {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .months__name,
  .months__band,
  .months__tick {
    transition: none;
  }
}
</style>
