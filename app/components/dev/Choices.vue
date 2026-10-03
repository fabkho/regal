<script setup lang="ts">
// Dev-only drawer: links that play the decided re-sort transitions. Settled
// decisions are not listed here (see DECIDED_LOOK in useDevChoices.ts). The
// cover-override tool went with the sources (it belongs to the Pipeline).
import { readYears } from '#layers/regal/app/utils/stack/view'

const { books } = useLibrary()
const mode = useViewMode()
const { putAway } = useBookPick()
const { view: stackView, set: setStackView } = useStackView()
const open = useState('dev-choices:open', () => false)

function showStack() {
  putAway()
  mode.value = 'stack'
}

/** Flips the rating filter between ★ 4.5+ and all: many Books enter, then leave. */
function filterNow() {
  if (mode.value !== 'stack') showStack()
  setStackView({ minRating: stackView.value.minRating ? 0 : 4.5 })
}

const years = computed(() => readYears(books.value))
/** The year 'New year' switches to: the next one read, round the list. */
const nextYear = computed(() => {
  const list = years.value
  const current = stackView.value.year
  return current === null ? list[0] ?? null : list[(list.indexOf(current) + 1) % list.length] ?? null
})

/** Switches the year filter, so no Book stays and the whole pile is swapped. */
function yearNow() {
  if (mode.value !== 'stack') showStack()
  if (nextYear.value !== null) setStackView({ year: nextYear.value })
}
</script>

<template>
  <div class="choices-root">
    <button
      type="button"
      class="choices-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'Close choices' : 'Choices (dev)' }}
    </button>

    <aside
      v-if="open"
      class="choices"
      aria-label="Design choices"
    >
      <header class="choices__header">
        <h2 class="choices__title">
          Your choices
        </h2>
      </header>

      <section class="choices__section">
        <h3 class="choices__heading">
          Try the decided transitions
        </h3>
        <p class="choices__hint">
          New books pop in scattered around the pile, leaving ones slide out and shrink away;
          a new year sweeps the old pile out to the left while the new one settles in.
        </p>
        <p class="choices__hint">
          <button
            type="button"
            class="choices__link"
            @click="filterNow"
          >
            Filter ({{ stackView.minRating ? `★ ${stackView.minRating}+ → all` : 'all → ★ 4.5+' }})
          </button>
          <button
            v-if="years.length > 1"
            type="button"
            class="choices__link"
            @click="yearNow"
          >
            New year ({{ stackView.year ?? 'all years' }} → {{ nextYear }})
          </button>
        </p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.choices-toggle {
  position: fixed;
  left: 1rem;
  bottom: 3.2rem;
  z-index: 40;
  padding: 0.45rem 0.8rem;
  font: inherit;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-bg);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  cursor: pointer;
}

.choices {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  width: min(30rem, 100vw);
  overflow-y: auto;
  padding: 1.2rem 1.4rem 4rem;
  background: var(--color-bg);
  border-left: 1px solid var(--color-ink);
  box-shadow: -10px 0 30px rgb(0 0 0 / 0.06);
}

.choices__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.choices__title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.4rem;
  font-style: italic;
  font-weight: 400;
}

.choices__hint {
  margin: 0.4rem 0 0.6rem;
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
}

.choices__section {
  padding: 1rem 0;
  border-top: 1px solid var(--color-line);
}

.choices__heading {
  margin: 0 0 0.4rem;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.choices__link {
  font: inherit;
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}

.choices__link + .choices__link {
  margin-left: 0.8rem;
}
</style>
