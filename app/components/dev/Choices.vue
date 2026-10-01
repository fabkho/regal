<script setup lang="ts">
// Dev-only drawer with the open design decisions, previewed live (click next
// to a picked Book, date separators, new and leaving Books) plus two tools
// (cover overrides, notes). Picks are saved to .data/choices.json. Settled
// decisions are not listed here (see DECIDED_LOOK in useDevChoices.ts).
import { SEPARATOR_STYLES } from '~/utils/stack/separators'
import { ENTRANCE_STYLES } from '~/utils/stack/shuffle'
import type { Entrance } from '~/composables/useDevChoices'
import type { PickOutside } from '~/utils/books/pick'

const { choices, saved, set, restore } = useDevChoices()
const { books } = useLibrary()
const mode = useViewMode()
const { putAway } = useBookPick()
const { view: stackView, set: setStackView } = useStackView()
const open = useState('dev-choices:open', () => false)

onMounted(restore)

function showStack() {
  putAway()
  mode.value = 'stack'
}

// --- 1. Clicking next to a picked Book --------------------------------------
const PICK_OUTSIDE: { value: PickOutside, title: string, text: string }[] = [
  { value: 'put-back', title: 'Puts it back (recommended)', text: 'Any click outside the picked Book puts it back, also on the pile around it. Taking another Book out is a second click.' },
  { value: 'swap', title: 'Takes the clicked Book out', text: 'A click on another Book swaps straight to it; only empty space puts back. In the Stack the pile fills most of the space next to a picked Book.' },
]

// --- 2. New and leaving books -------------------------------------------------
const RECOMMENDED_ENTRANCE = 'fade'

/** Flips the rating filter between ★ 4.5+ and all: many Books enter, then leave. */
function filterNow() {
  if (mode.value !== 'stack') showStack()
  setStackView({ minRating: stackView.value.minRating ? 0 : 4.5 })
}

function tryEntrance(value: Entrance) {
  set('entrance', value)
  filterNow()
}

// --- Tools: cover overrides -------------------------------------------------
interface Edition { id: string, name: string, released: string | null, thumb: string, full: string, film: boolean }
const manifest = ref<Record<string, { front?: string, back?: string }>>({})
const editions = ref<Record<string, { list: Edition[], auto: string | null } | 'loading'>>({})
const editionsOpen = ref(false)
const keyOf = (book: { isbn13: string | null, id: string }) => book.isbn13 ?? book.id

async function loadEditions() {
  editionsOpen.value = !editionsOpen.value
  if (!editionsOpen.value) return
  for (const book of books.value) {
    const key = keyOf(book)
    if (editions.value[key]) continue
    editions.value[key] = 'loading'
    $fetch<{ editions: Edition[], auto: string | null }>('/api/dev/editions', { query: { title: book.title, author: book.author ?? '', isbn: book.isbn13 ?? '' } })
      .then((result) => { editions.value[key] = { list: result.editions, auto: result.auto } })
      .catch(() => { editions.value[key] = { list: [], auto: null } })
  }
}

function pickEdition(key: string, url: string) {
  const current = choices.value.editionPicks
  // Clicking the picked cover again un-picks it.
  const picks = Object.fromEntries(Object.entries(current).filter(([book]) => book !== key))
  if (current[key] !== url) picks[key] = url
  set('editionPicks', picks)
}

// --- Manifest (current covers for the override tool) ---------------------
onMounted(async () => {
  manifest.value = await $fetch<Record<string, { front?: string, back?: string }>>('/book-assets/manifest.json').catch(() => ({}))
})
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
        <span class="choices__saved">{{ saved === 'saved' ? 'saved ✓' : saved === 'saving' ? 'saving…' : saved === 'error' ? 'not saved' : '' }}</span>
      </header>
      <p class="choices__intro">
        Every pick applies live and is saved for Claude in <code>.data/choices.json</code>.
      </p>

      <section class="choices__section">
        <h3 class="choices__heading">
          Click next to a picked book
        </h3>
        <label
          v-for="option in PICK_OUTSIDE"
          :key="option.value"
          class="choices__option"
          :data-on="choices.pickOutside === option.value"
        >
          <input
            type="radio"
            name="pick-outside"
            :checked="choices.pickOutside === option.value"
            @change="set('pickOutside', option.value)"
          >
          <span>
            <strong>{{ option.title }}</strong>
            <small>{{ option.text }}</small>
          </span>
        </label>
      </section>

      <!-- Date separators -->
      <section class="choices__section">
        <h3 class="choices__heading">
          Stack date separators
        </h3>
        <p class="choices__hint">
          Under each year (each month when one year is filtered) while sorted by date read. Grouping: Stack controls → Group.
        </p>
        <label
          v-for="option in SEPARATOR_STYLES"
          :key="option.value"
          class="choices__option"
          :data-on="choices.separatorStyle === option.value"
        >
          <input
            type="radio"
            name="separator-style"
            :checked="choices.separatorStyle === option.value"
            @change="set('separatorStyle', option.value); showStack()"
          >
          <span>
            <strong>{{ option.title }}{{ option.value === 'numerals' ? ' (recommended)' : '' }}</strong>
            <small>{{ option.text }}</small>
          </span>
        </label>
      </section>

      <section class="choices__section">
        <h3 class="choices__heading">
          Open · New and leaving books
        </h3>
        <p class="choices__hint">
          When a filter brings books back, they turn up scattered around the pile, near where they belong, then join it;
          leaving books slide out and vanish. Never through another book.
          <button
            type="button"
            class="choices__link"
            @click="filterNow"
          >
            Try it ({{ stackView.minRating ? `★ ${stackView.minRating}+ → all` : 'all → ★ 4.5+' }})
          </button>
        </p>
        <label
          v-for="option in ENTRANCE_STYLES"
          :key="option.value"
          class="choices__option"
          :data-on="choices.entrance === option.value"
        >
          <input
            type="radio"
            name="entrance"
            :checked="choices.entrance === option.value"
            @change="set('entrance', option.value)"
          >
          <span class="choices__grow">
            <strong>{{ option.title }}{{ option.value === RECOMMENDED_ENTRANCE ? ' (recommended)' : '' }}</strong>
            <small>{{ option.text }}</small>
          </span>
          <button
            type="button"
            class="choices__try"
            @click.prevent="tryEntrance(option.value)"
          >
            Try
          </button>
        </label>
      </section>

      <!-- Tools -->
      <section class="choices__section">
        <h3 class="choices__heading">
          Tools (optional)
        </h3>
        <p class="choices__hint">
          <strong>Photos of special editions:</strong> put <code>front.jpg</code>, <code>spine.jpg</code>, <code>back.jpg</code> in
          <code>public/book-assets/&lt;ISBN-13&gt;/photo/</code> and run <code>pnpm assets:build --photos-only</code>.
          Photos win over AI and get no extra text.
        </p>
        <p class="choices__hint">
          <strong>Cover overrides:</strong> a cover picked below becomes the Book's front on the next
          <code>pnpm assets:build --limit all --no-ai</code> (German editions come from the German store).
        </p>
        <button
          type="button"
          class="choices__button"
          @click="loadEditions"
        >
          {{ editionsOpen ? 'Hide cover overrides' : `Override a cover (editions for ${books.length} books)` }}
        </button>
        <div v-if="editionsOpen">
          <div
            v-for="book in books"
            :key="book.id"
            class="choices__book"
          >
            <p class="choices__book-title">
              {{ book.title }}
            </p>
            <div class="choices__covers">
              <figure
                v-if="manifest[keyOf(book)]?.front"
                class="choices__cover choices__cover--current"
              >
                <img
                  :src="`/book-assets/${manifest[keyOf(book)]!.front}`"
                  alt="Current cover"
                  loading="lazy"
                >
                <figcaption>now</figcaption>
              </figure>
              <span
                v-if="editions[keyOf(book)] === 'loading'"
                class="choices__hint"
              >searching…</span>
              <template v-else-if="editions[keyOf(book)]">
                <button
                  v-for="edition in (editions[keyOf(book)] as { list: Edition[], auto: string | null }).list"
                  :key="edition.id"
                  type="button"
                  class="choices__cover"
                  :data-picked="choices.editionPicks[keyOf(book)] === edition.full"
                  :title="`${edition.name} (${edition.released ?? '?'})`"
                  @click="pickEdition(keyOf(book), edition.full)"
                >
                  <img
                    :src="edition.thumb"
                    :alt="edition.name"
                    loading="lazy"
                  >
                  <span class="choices__badges">
                    <span v-if="edition.film">film</span>
                    {{ edition.released?.slice(0, 4) }}
                  </span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </section>

      <section class="choices__section">
        <h3 class="choices__heading">
          Notes
        </h3>
        <textarea
          class="choices__notes"
          rows="4"
          placeholder="Anything else?"
          :value="choices.notes"
          @change="set('notes', ($event.target as HTMLTextAreaElement).value)"
        />
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

.choices__saved,
.choices__issue {
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: none;
}

.choices__intro,
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

.choices__option {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  margin: 0.35rem 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--color-line);
  cursor: pointer;
}

.choices__option[data-on='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 6%, var(--color-bg));
}

.choices__option input {
  margin-top: 0.15rem;
  accent-color: var(--color-accent);
}

.choices__option strong {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
}

.choices__option small {
  display: block;
  margin-top: 0.15rem;
  color: var(--color-ink-muted);
  font-size: var(--text-xs);
}

.choices__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.choices__option--small strong {
  font-size: var(--text-xs);
}

.choices__figure {
  display: block;
  margin: 0.2rem 0;
  color: var(--color-accent);
  font-size: 1.3rem;
}

.choices__flow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  margin-top: 0.45rem;
  font-size: var(--text-2xs, 0.65rem);
}

.choices__step {
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--color-ink);
}

.choices__arrow {
  color: var(--color-accent);
}

.choices__link,
.choices__button {
  font: inherit;
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}

.choices__button {
  margin-top: 0.5rem;
}

.choices__book {
  margin-top: 0.8rem;
}

.choices__book-title {
  margin: 0 0 0.3rem;
  font-size: var(--text-xs);
}

.choices__covers {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  padding-bottom: 0.3rem;
}

.choices__cover {
  flex: none;
  margin: 0;
  padding: 0;
  width: 58px;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
}

.choices__cover img {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
}

.choices__cover--current {
  border-color: var(--color-ink);
  cursor: default;
}

.choices__cover[data-picked='true'] {
  border-color: var(--color-accent);
}

.choices__cover figcaption,
.choices__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  font-size: 0.6rem;
  color: var(--color-ink-muted);
  text-transform: uppercase;
}

.choices__badges span {
  padding: 0 0.2rem;
  color: var(--color-bg);
  background: var(--color-ink-muted);
}

.choices__badges .choices__badge--auto {
  background: var(--color-accent);
}

.choices__notes {
  width: 100%;
  font: inherit;
  font-size: var(--text-sm);
  padding: 0.5rem;
  border: 1px solid var(--color-line);
  background: transparent;
}

.choices__try {
  align-self: center;
  padding: 0.25rem 0.6rem;
  font: inherit;
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  cursor: pointer;
}

.choices__grow {
  flex: 1;
}
</style>
