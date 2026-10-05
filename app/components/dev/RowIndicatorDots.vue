<script setup lang="ts">
// 2 · Dots (Instagram-style). A short row of dots, at most 7 in view: the
// window slides along, the dots at its edges shrink to say there are more.
// One dot is a month (`unit="month"`: which month you are in) or a screen-wide
// page (`unit="page"`: how many screens are left). The active dot is a longer
// pill in the accent. Tapping a dot jumps there (smooth, instant under Reduce
// Motion). With few dots (a few months, a short row) there is no window.
import type { RowIndicatorState } from '#layers/regal/app/dev/row-scrollbar/useRowIndicator'
import { useScrollbarA11y } from '#layers/regal/app/dev/row-scrollbar/a11y'

const props = withDefaults(defineProps<{ state: RowIndicatorState, unit?: 'month' | 'page' }>(), { unit: 'month' })
const { attrs, onKeydown } = useScrollbarA11y(props.state, 'Scroll position')

const MAX = 7
/** Slot width (px) of one dot. */
const SLOT = 13

const count = computed(() => (props.unit === 'month'
  ? props.state.months.length
  : Math.max(2, Math.ceil(props.state.scrollWidth / Math.max(1, props.state.clientWidth)))))
const active = computed(() => (props.unit === 'month'
  ? props.state.monthIndex
  : Math.round(props.state.progress * (count.value - 1))))
const windowed = computed(() => count.value > MAX)
const first = computed(() => (windowed.value ? Math.min(count.value - MAX, Math.max(0, active.value - Math.floor(MAX / 2))) : 0))
const slots = computed(() => Math.min(count.value, MAX))

/** 0..1: how big dot `i` is; the window's edges shrink where more follows. */
function scale(index: number) {
  const at = index - first.value
  if (at < 0 || at >= slots.value) return 0
  if (!windowed.value) return 1
  const moreBefore = first.value > 0
  const moreAfter = first.value + slots.value < count.value
  if ((moreBefore && at === 0) || (moreAfter && at === slots.value - 1)) return 0.4
  if ((moreBefore && at === 1) || (moreAfter && at === slots.value - 2)) return 0.7
  return 1
}

function jump(index: number) {
  if (props.unit === 'month') props.state.scrollToMonth(index)
  else props.state.scrollToProgress(index / Math.max(1, count.value - 1))
}
const label = (index: number) => (props.unit === 'month'
  ? props.state.months[index]?.label
  : `Screen ${index + 1} of ${count.value}`)
</script>

<template>
  <div
    class="dots"
    :class="{ 'dots--live': state.scrolling || state.interacting }"
  >
    <div
      v-bind="attrs"
      class="dots__row"
      :style="{ width: `${slots * SLOT + 12}px` }"
      @keydown="onKeydown"
    >
      <div
        class="dots__belt"
        :style="{ transform: `translateX(${-first * SLOT}px)` }"
      >
        <button
          v-for="(_, index) in count"
          :key="index"
          type="button"
          class="dots__dot"
          :class="{ 'dots__dot--active': index === active }"
          :style="{ '--s': scale(index), 'left': `${index * SLOT}px`, 'width': `${SLOT}px` }"
          tabindex="-1"
          aria-hidden="true"
          :title="label(index)"
          @click="jump(index)"
        >
          <span />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4px;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.dots__row {
  position: relative;
  height: 28px;
  padding: 0 6px;
  overflow: hidden;
  pointer-events: auto;
  outline: none;
  transition: width 0.3s ease;
}

.dots__belt {
  position: relative;
  height: 100%;
  transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.2, 1);
}

.dots__dot {
  position: absolute;
  top: 0;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dots__dot span {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 99px;
  background: var(--i-ink);
  opacity: 0.28;
  transform: scale(var(--s));
  transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.2, 1), width 0.3s ease, background-color 0.3s ease, opacity 0.3s ease;
}

.dots--live .dots__dot span {
  opacity: 0.42;
}

.dots__dot--active span {
  width: 10px;
  background: var(--i-accent);
  opacity: 1;
}

.dots__dot--active {
  /* The pill is wider than the slot's dot: it stays centred on it. */
  z-index: 1;
}

.ind--reduced .dots__row,
.ind--reduced .dots__belt,
.ind--reduced .dots__dot span {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .dots__row,
  .dots__belt,
  .dots__dot span {
    transition: none;
  }
}
</style>
