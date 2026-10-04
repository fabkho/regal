<script setup lang="ts">
// PROTOTYPE (phase 1): three ways to fit the Stack's sort & filter onto a
// phone, above the pile. 'scroll' = one swipeable chip row, 'bar' = one line
// showing the choices that opens a panel, 'rows' = sort as a segmented row and
// the rest as native pickers. One of them stays; the others go.
import { DEFAULT_STACK_VIEW, readYears, STACK_GROUPINGS, STACK_SORTS } from '#layers/regal/app/utils/stack/view'

const props = withDefaults(defineProps<{ variant?: 'scroll' | 'bar' | 'rows' }>(), { variant: 'scroll' })

const { books } = useLibrary()
const { view, set } = useStackView()
const years = computed(() => readYears(books.value))
const RATINGS = [0, 4, 4.5]
const ratingLabel = (rating: number) => (rating ? `★ ${rating}+` : 'All')

const summary = computed(() => {
  const parts = [STACK_SORTS.find(option => option.value === view.value.sort)!.label]
  if (view.value.sort === 'date') parts.push(STACK_GROUPINGS.find(option => option.value === view.value.group)!.label)
  if (years.value.length > 1) parts.push(view.value.year ? String(view.value.year) : 'All years')
  parts.push(view.value.minRating ? `★ ${view.value.minRating}+` : 'All ratings')
  return parts.join(' · ')
})
const changed = computed(() => view.value.sort !== DEFAULT_STACK_VIEW.sort || view.value.year !== null || view.value.minRating !== 0)

// 'bar': the panel closes on a tap outside it or Escape.
const open = ref(false)
const root = ref<HTMLElement | null>(null)
function close(event: Event) {
  if (event.type === 'keydown' ? (event as KeyboardEvent).key === 'Escape' : !root.value?.contains(event.target as Node)) open.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', close)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('keydown', close)
})

const onYear = (event: Event) => set({ year: Number((event.target as HTMLSelectElement).value) || null })
const onRating = (event: Event) => set({ minRating: Number((event.target as HTMLSelectElement).value) })
const onGroup = (event: Event) => set({ group: (event.target as HTMLSelectElement).value as typeof view.value.group })
</script>

<template>
  <div
    ref="root"
    class="mf"
    :class="`mf--${props.variant}`"
  >
    <!-- a: one row, swipe sideways -->
    <div
      v-if="props.variant === 'scroll'"
      class="mf__strip"
      role="toolbar"
      aria-label="Sort and filter"
    >
      <div
        class="mf__group"
        role="group"
        aria-label="Sort"
      >
        <span class="mf__label">Sort</span>
        <button
          v-for="option in STACK_SORTS"
          :key="option.value"
          type="button"
          class="mf__chip"
          :aria-pressed="view.sort === option.value"
          @click="set({ sort: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
      <div
        v-if="view.sort === 'date'"
        class="mf__group"
        role="group"
        aria-label="Date separators"
      >
        <span class="mf__label">Group</span>
        <button
          v-for="option in STACK_GROUPINGS"
          :key="option.value"
          type="button"
          class="mf__chip"
          :aria-pressed="view.group === option.value"
          @click="set({ group: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
      <div
        v-if="years.length > 1"
        class="mf__group"
        role="group"
        aria-label="Year read"
      >
        <span class="mf__label">Year</span>
        <button
          type="button"
          class="mf__chip"
          :aria-pressed="view.year === null"
          @click="set({ year: null })"
        >
          All
        </button>
        <button
          v-for="year in years"
          :key="year"
          type="button"
          class="mf__chip"
          :aria-pressed="view.year === year"
          @click="set({ year })"
        >
          {{ year }}
        </button>
      </div>
      <div
        class="mf__group"
        role="group"
        aria-label="Minimum rating"
      >
        <span class="mf__label">Rating</span>
        <button
          v-for="rating in RATINGS"
          :key="rating"
          type="button"
          class="mf__chip"
          :aria-pressed="view.minRating === rating"
          @click="set({ minRating: rating })"
        >
          {{ ratingLabel(rating) }}
        </button>
      </div>
    </div>

    <!-- b: one line with the choices, a panel on tap -->
    <template v-else-if="props.variant === 'bar'">
      <button
        type="button"
        class="mf__bar"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="mf__bar-text">
          <span class="mf__label">Sort &amp; filter</span>
          <span
            class="mf__bar-summary"
            :class="{ 'mf__bar-summary--changed': changed }"
          >{{ summary }}</span>
        </span>
        <span
          class="mf__bar-caret"
          :class="{ 'mf__bar-caret--open': open }"
          aria-hidden="true"
        >▾</span>
      </button>
      <div
        v-if="open"
        class="mf__panel"
      >
        <div
          class="mf__group mf__group--panel"
          role="group"
          aria-label="Sort"
        >
          <span class="mf__label">Sort</span>
          <div class="mf__wrap">
            <button
              v-for="option in STACK_SORTS"
              :key="option.value"
              type="button"
              class="mf__chip"
              :aria-pressed="view.sort === option.value"
              @click="set({ sort: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div
          v-if="view.sort === 'date'"
          class="mf__group mf__group--panel"
          role="group"
          aria-label="Date separators"
        >
          <span class="mf__label">Group</span>
          <div class="mf__wrap">
            <button
              v-for="option in STACK_GROUPINGS"
              :key="option.value"
              type="button"
              class="mf__chip"
              :aria-pressed="view.group === option.value"
              @click="set({ group: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div
          v-if="years.length > 1"
          class="mf__group mf__group--panel"
          role="group"
          aria-label="Year read"
        >
          <span class="mf__label">Year</span>
          <div class="mf__wrap">
            <button
              type="button"
              class="mf__chip"
              :aria-pressed="view.year === null"
              @click="set({ year: null })"
            >
              All
            </button>
            <button
              v-for="year in years"
              :key="year"
              type="button"
              class="mf__chip"
              :aria-pressed="view.year === year"
              @click="set({ year })"
            >
              {{ year }}
            </button>
          </div>
        </div>
        <div
          class="mf__group mf__group--panel"
          role="group"
          aria-label="Minimum rating"
        >
          <span class="mf__label">Rating</span>
          <div class="mf__wrap">
            <button
              v-for="rating in RATINGS"
              :key="rating"
              type="button"
              class="mf__chip"
              :aria-pressed="view.minRating === rating"
              @click="set({ minRating: rating })"
            >
              {{ ratingLabel(rating) }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- c: sort as a segmented row, the rest as native pickers -->
    <template v-else>
      <div
        class="mf__segments"
        role="group"
        aria-label="Sort"
      >
        <button
          v-for="option in STACK_SORTS"
          :key="option.value"
          type="button"
          class="mf__chip mf__chip--segment"
          :aria-pressed="view.sort === option.value"
          @click="set({ sort: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="mf__pickers">
        <label
          v-if="view.sort === 'date'"
          class="mf__picker"
        >
          <span class="mf__label">Group</span>
          <select
            class="mf__select"
            :value="view.group"
            @change="onGroup"
          >
            <option
              v-for="option in STACK_GROUPINGS"
              :key="option.value"
              :value="option.value"
            >{{ option.label }}</option>
          </select>
        </label>
        <label
          v-if="years.length > 1"
          class="mf__picker"
        >
          <span class="mf__label">Year</span>
          <select
            class="mf__select"
            :value="view.year ?? 0"
            @change="onYear"
          >
            <option value="0">All</option>
            <option
              v-for="year in years"
              :key="year"
              :value="year"
            >{{ year }}</option>
          </select>
        </label>
        <label class="mf__picker">
          <span class="mf__label">Rating</span>
          <select
            class="mf__select"
            :value="view.minRating"
            @change="onRating"
          >
            <option
              v-for="rating in RATINGS"
              :key="rating"
              :value="rating"
            >{{ ratingLabel(rating) }}</option>
          </select>
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mf {
  position: relative;
  color: var(--color-ink, #2C2C2A);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--color-bg, #F5F2EB);
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
}

.mf__label {
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  letter-spacing: 0.08em;
}

.mf__chip {
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

.mf__chip[aria-pressed='true'] {
  color: var(--color-bg, #F5F2EB);
  background: var(--color-ink, #2C2C2A);
  border-color: var(--color-ink, #2C2C2A);
}

/* a: a single swipeable row; the group labels sit inline, a fade at the right
   edge says there is more. */
.mf__strip {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 0.4rem 1rem;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
}

.mf__strip::-webkit-scrollbar {
  display: none;
}

.mf__strip .mf__group {
  display: flex;
  flex: none;
  align-items: center;
}

.mf__strip .mf__label {
  margin-right: 0.45rem;
}

.mf__strip .mf__chip + .mf__chip {
  margin-left: -1px;
}

/* b: the closed bar is one tap target; the panel drops over the pile only while open. */
.mf__bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0 1rem;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: left;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.mf__bar-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.mf__bar-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mf__bar-summary--changed {
  color: var(--color-accent, #B93E2E);
}

.mf__bar-caret {
  flex: none;
  transition: transform 0.15s ease-out;
}

.mf__bar-caret--open {
  transform: rotate(180deg);
}

.mf__panel {
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

.mf__group--panel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mf__wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

/* c: sort cells share the width; the pickers share the second row. */
.mf__segments {
  display: flex;
  padding: 0.5rem 1rem 0;
}

.mf__chip--segment {
  flex: 1 1 0;
  padding: 0 0.2rem;
  min-width: 0;
}

.mf__chip--segment + .mf__chip--segment {
  margin-left: -1px;
}

.mf__pickers {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}

.mf__picker {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
}

.mf__picker::after {
  content: '▾';
  position: absolute;
  right: 0.6rem;
  bottom: 0.45rem;
  pointer-events: none;
}

.mf__select {
  width: 100%;
  padding: 0;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: var(--color-ink, #2C2C2A);
  background: transparent;
  border: 0;
  border-radius: 0;
  appearance: none;
}
</style>
