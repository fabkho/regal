<script setup lang="ts">
// Sort & filter for the Stack (#27): 'chips' (a row over the 3D), 'stacked'
// (one group per line, for a sidebar) or 'menu' (one button, popover).
import { readYears, STACK_SORTS } from '~/utils/stack/view'

const props = defineProps<{ variant: 'chips' | 'stacked' | 'menu' }>()

const { books } = useLibrary()
const { view, set } = useStackView()
const years = computed(() => readYears(books.value))
const open = ref(false)
const RATINGS = [0, 4, 4.5]

const summary = computed(() => {
  const sort = STACK_SORTS.find(option => option.value === view.value.sort)!.label
  const parts = [sort]
  if (view.value.year) parts.push(String(view.value.year))
  if (view.value.minRating) parts.push(`★ ${view.value.minRating}+`)
  return parts.join(' · ')
})
</script>

<template>
  <div
    class="controls"
    :class="`controls--${props.variant}`"
  >
    <button
      v-if="props.variant === 'menu'"
      type="button"
      class="controls__toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      Sort &amp; filter <span class="controls__summary">{{ summary }}</span>
    </button>

    <div
      v-if="props.variant !== 'menu' || open"
      class="controls__body"
    >
      <div
        class="controls__group"
        role="group"
        aria-label="Sort"
      >
        <span class="controls__label">Sort</span>
        <button
          v-for="option in STACK_SORTS"
          :key="option.value"
          type="button"
          class="controls__chip"
          :aria-pressed="view.sort === option.value"
          @click="set({ sort: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
      <div
        v-if="years.length > 1"
        class="controls__group"
        role="group"
        aria-label="Year read"
      >
        <span class="controls__label">Year</span>
        <button
          type="button"
          class="controls__chip"
          :aria-pressed="view.year === null"
          @click="set({ year: null })"
        >
          All
        </button>
        <button
          v-for="year in years"
          :key="year"
          type="button"
          class="controls__chip"
          :aria-pressed="view.year === year"
          @click="set({ year })"
        >
          {{ year }}
        </button>
      </div>
      <div
        class="controls__group"
        role="group"
        aria-label="Minimum rating"
      >
        <span class="controls__label">Rating</span>
        <button
          v-for="rating in RATINGS"
          :key="rating"
          type="button"
          class="controls__chip"
          :aria-pressed="view.minRating === rating"
          @click="set({ minRating: rating })"
        >
          {{ rating ? `★ ${rating}+` : 'All' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.controls__body {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
}

.controls--stacked .controls__body {
  flex-direction: column;
  gap: 0.6rem;
}

.controls--menu .controls__body {
  position: absolute;
  margin-top: 0.4rem;
  flex-direction: column;
  padding: 0.8rem;
  background: var(--color-bg);
  border: 1px solid var(--color-ink);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.08);
}

.controls__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.controls__label {
  min-width: 3.6rem;
  color: var(--color-ink-muted);
}

.controls__chip,
.controls__toggle {
  padding: 0.25rem 0.55rem;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: var(--color-ink);
  background: var(--color-bg);
  border: 1px solid var(--color-line);
  cursor: pointer;
}

.controls__chip[aria-pressed='true'] {
  color: var(--color-bg);
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.controls__toggle {
  border-color: var(--color-ink);
}

.controls__summary {
  margin-left: 0.4rem;
  color: var(--color-accent);
}
</style>
