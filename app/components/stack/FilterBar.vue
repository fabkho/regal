<script setup lang="ts">
// The Stack's sort & filter for a phone: one line with the choices ("Date read ·
// Year · All years · All ratings", accent when changed) above the pile. A tap
// opens a panel with every group; it drops over the pile (the bar itself keeps
// its height, nothing moves) and closes on a tap outside or Escape.
import { DEFAULT_STACK_VIEW, readYears, STACK_GROUPINGS, STACK_SORTS, viewSummary } from '#layers/regal/app/utils/stack/view'

const { books } = useLibrary()
const { view, set } = useStackView()
const years = computed(() => readYears(books.value))
const RATINGS = [0, 4, 4.5]

const summary = computed(() => viewSummary(view.value, years.value.length > 1))
const changed = computed(() => view.value.sort !== DEFAULT_STACK_VIEW.sort || view.value.year !== null || view.value.minRating !== 0)

const open = ref(false)
const root = ref<HTMLElement | null>(null)
function close(event: Event) {
  if (event.type === 'keydown') {
    if ((event as KeyboardEvent).key === 'Escape') open.value = false
  }
  else if (!root.value?.contains(event.target as Node)) open.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', close)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('keydown', close)
})
</script>

<template>
  <div
    ref="root"
    class="bar"
  >
    <button
      type="button"
      class="bar__toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="bar__text">
        <span class="bar__label">Sort &amp; filter</span>
        <span
          class="bar__summary"
          :class="{ 'bar__summary--changed': changed }"
        >{{ summary }}</span>
      </span>
      <span
        class="bar__caret"
        :class="{ 'bar__caret--open': open }"
        aria-hidden="true"
      >▾</span>
    </button>

    <div
      v-if="open"
      class="bar__panel"
    >
      <div
        class="bar__group"
        role="group"
        aria-label="Sort"
      >
        <span class="bar__label">Sort</span>
        <div class="bar__chips">
          <button
            v-for="option in STACK_SORTS"
            :key="option.value"
            type="button"
            class="bar__chip"
            :aria-pressed="view.sort === option.value"
            @click="set({ sort: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div
        v-if="view.sort === 'date'"
        class="bar__group"
        role="group"
        aria-label="Date separators"
      >
        <span class="bar__label">Group</span>
        <div class="bar__chips">
          <button
            v-for="option in STACK_GROUPINGS"
            :key="option.value"
            type="button"
            class="bar__chip"
            :aria-pressed="view.group === option.value"
            @click="set({ group: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div
        v-if="years.length > 1"
        class="bar__group"
        role="group"
        aria-label="Year read"
      >
        <span class="bar__label">Year</span>
        <div class="bar__chips">
          <button
            type="button"
            class="bar__chip"
            :aria-pressed="view.year === null"
            @click="set({ year: null })"
          >
            All
          </button>
          <button
            v-for="year in years"
            :key="year"
            type="button"
            class="bar__chip"
            :aria-pressed="view.year === year"
            @click="set({ year })"
          >
            {{ year }}
          </button>
        </div>
      </div>
      <div
        class="bar__group"
        role="group"
        aria-label="Minimum rating"
      >
        <span class="bar__label">Rating</span>
        <div class="bar__chips">
          <button
            v-for="rating in RATINGS"
            :key="rating"
            type="button"
            class="bar__chip"
            :aria-pressed="view.minRating === rating"
            @click="set({ minRating: rating })"
          >
            {{ rating ? `★ ${rating}+` : 'All' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: relative;
  color: var(--color-ink, #2C2C2A);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--color-bg, #F5F2EB);
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
}

.bar__label {
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  letter-spacing: 0.08em;
}

/* Fixed height: a host sizes the pile below it in CSS (RegalBooksFilters). */
.bar__toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  height: var(--regal-filter-bar-height, 2.8rem);
  padding: 0 1rem;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: left;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  touch-action: manipulation;
}

.bar__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.bar__summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar__summary--changed {
  color: var(--color-accent, #B93E2E);
}

.bar__caret {
  flex: none;
  transition: transform 0.15s ease-out;
}

.bar__caret--open {
  transform: rotate(180deg);
}

/* An overlay: out of the flow, paper-opaque, above the 3D and its labels. */
.bar__panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.9rem 1rem 1rem;
  background: var(--color-bg, #F5F2EB);
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
}

.bar__group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.bar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.bar__chip {
  min-height: 2.25rem;
  padding: 0 0.7rem;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: nowrap;
  color: var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
  border: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
  cursor: pointer;
  touch-action: manipulation;
}

.bar__chip[aria-pressed='true'] {
  color: var(--color-bg, #F5F2EB);
  background: var(--color-ink, #2C2C2A);
  border-color: var(--color-ink, #2C2C2A);
}
</style>
