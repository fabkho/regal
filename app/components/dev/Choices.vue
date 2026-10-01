<script setup lang="ts">
// Dev-only drawer with the open design decisions, previewed live where they
// can be: rating styles and sort/filter change the 3D scene right away; the
// portfolio option can preview the Stack at sidebar width; cover editions
// show every edition found. Picks are saved to .data/choices.json.
import type { DevChoices, RatingStyle } from '~/composables/useDevChoices'

const { choices, saved, set, toggleRating, restore } = useDevChoices()
const { books } = useLibrary()
const mode = useViewMode()
const { putAway } = useBookPick()
const open = useState('dev-choices:open', () => false)

onMounted(restore)

function showStack() {
  putAway()
  mode.value = 'stack'
}

// --- 1. Ratings -------------------------------------------------------------
const RATING_OPTIONS: { value: RatingStyle, title: string, text: string }[] = [
  { value: 'card', title: 'A · Details card', text: 'Quarter stars and the value in the card. Always on.' },
  { value: 'bookmark', title: 'B · Bookmark', text: 'Favourites (★ 4.5+) get a red bookmark out of the head; 5★ shows more of it.' },
  { value: 'proud', title: 'C · Stand proud', text: 'Favourites stick out: 12 mm from the Shelf, 3 cm out of the Stack.' },
  { value: 'label', title: 'D · Hover label', text: 'Hovering a Book shows its title and rating next to the pointer.' },
]
const favourites = computed(() => books.value.filter(book => book.rating >= 4.5).length)

// --- 2. Sort & filter -------------------------------------------------------
const SORT_UI: { value: DevChoices['sortUi'], title: string, text: string }[] = [
  { value: 'chips', title: '1 · Chip row', text: 'Always visible above the Stack; every option one click away.' },
  { value: 'menu', title: '2 · Menu', text: 'One “Sort & filter” button with a popover; calmer, fits a sidebar.' },
  { value: 'url', title: '3 · URL only', text: 'No controls; the portfolio links a fixed view (?sort=rating).' },
]
const MOTION: { value: DevChoices['sortMotion'], title: string }[] = [
  { value: 'animate', title: 'Books fly to their new place' },
  { value: 'instant', title: 'Instant re-stack' },
]

// --- 3. Portfolio -----------------------------------------------------------
const PORTFOLIO: { value: Exclude<DevChoices['portfolio'], null>, title: string, text: string, flow: string[] }[] = [
  { value: 'static', title: 'A · Static snapshot', text: 'Script copies library.json + images into the portfolio repo; commit, deploy. Simplest, no runtime deps.', flow: ['Fable', 'tracker DB', 'assets:build', 'portfolio repo', 'deploy'] },
  { value: 'blob', title: 'B · Blob storage', text: 'Pipeline uploads to NuxtHub/R2; the portfolio reads at runtime. No commit per book.', flow: ['Fable', 'tracker DB', 'assets:build', 'R2 / NuxtHub', 'portfolio (runtime)'] },
  { value: 'layer', title: 'C · Regal as Nuxt layer', text: 'Portfolio extends Regal (layer/package) and gets the Stack component; data via A or B.', flow: ['regal (layer)', 'extends', 'portfolio', 'data: A or B'] },
]

// --- 4. Cover editions ------------------------------------------------------
const EDITIONS: { value: Exclude<DevChoices['editions'], null>, title: string, text: string }[] = [
  { value: 'photo', title: 'a · Photograph my copies', text: 'Real covers of your editions (#21).' },
  { value: 'auto', title: 'b · Auto: earliest non-film edition', text: 'Marked AUTO below.' },
  { value: 'manual', title: 'c · I pick per book', text: 'Click a cover below; your pick is saved.' },
]
interface Edition { id: string, name: string, released: string | null, thumb: string, full: string, film: boolean }
const manifest = ref<Record<string, { front?: string, back?: string }>>({})
const editions = ref<Record<string, { list: Edition[], auto: string | null } | 'loading'>>({})
const editionsOpen = ref(false)
const keyOf = (book: { isbn13: string | null, id: string }) => book.isbn13 ?? book.id

async function loadEditions() {
  editionsOpen.value = !editionsOpen.value
  if (!editionsOpen.value) return
  manifest.value = await $fetch<Record<string, { front?: string }>>('/book-assets/manifest.json').catch(() => ({}))
  for (const book of books.value) {
    const key = keyOf(book)
    if (editions.value[key]) continue
    editions.value[key] = 'loading'
    $fetch<{ editions: Edition[], auto: string | null }>('/api/dev/editions', { query: { title: book.title, author: book.author ?? '' } })
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
  if (choices.value.editions !== 'manual') set('editions', 'manual')
}

// --- 5. AI ------------------------------------------------------------------
const withoutBack = computed(() => books.value.filter(book => !manifest.value[keyOf(book)]?.back).length)
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
        Each pick applies live where it can and is saved for Claude in <code>.data/choices.json</code>.
      </p>

      <!-- 1 -->
      <section class="choices__section">
        <h3 class="choices__heading">
          1 · Ratings in 3D <span class="choices__issue">#26 · combine freely</span>
        </h3>
        <p class="choices__hint">
          {{ favourites }} of {{ books.length }} books are favourites (★ 4.5+).
          <button
            type="button"
            class="choices__link"
            @click="showStack"
          >
            Show Stack
          </button>
        </p>
        <label
          v-for="option in RATING_OPTIONS"
          :key="option.value"
          class="choices__option"
          :data-on="choices.rating.includes(option.value)"
        >
          <input
            type="checkbox"
            :checked="choices.rating.includes(option.value)"
            :disabled="option.value === 'card'"
            @change="toggleRating(option.value)"
          >
          <span>
            <strong>{{ option.title }}</strong>
            <small>{{ option.text }}</small>
          </span>
        </label>
      </section>

      <!-- 2 -->
      <section class="choices__section">
        <h3 class="choices__heading">
          2 · Sort &amp; filter <span class="choices__issue">#27</span>
        </h3>
        <p class="choices__hint">
          Try “Rating” in the Stack to see the motion.
          <button
            type="button"
            class="choices__link"
            @click="showStack"
          >
            Show Stack
          </button>
        </p>
        <label
          v-for="option in SORT_UI"
          :key="option.value"
          class="choices__option"
          :data-on="choices.sortUi === option.value"
        >
          <input
            type="radio"
            name="sort-ui"
            :checked="choices.sortUi === option.value"
            @change="set('sortUi', option.value)"
          >
          <span>
            <strong>{{ option.title }}</strong>
            <small>{{ option.text }}</small>
          </span>
        </label>
        <div class="choices__row">
          <label
            v-for="option in MOTION"
            :key="option.value"
            class="choices__option choices__option--small"
            :data-on="choices.sortMotion === option.value"
          >
            <input
              type="radio"
              name="sort-motion"
              :checked="choices.sortMotion === option.value"
              @change="set('sortMotion', option.value)"
            >
            <span><strong>{{ option.title }}</strong></span>
          </label>
        </div>
      </section>

      <!-- 3 -->
      <section class="choices__section">
        <h3 class="choices__heading">
          3 · Portfolio <span class="choices__issue">#28</span>
        </h3>
        <label
          class="choices__option"
          :data-on="choices.sidebarPreview"
        >
          <input
            type="checkbox"
            :checked="choices.sidebarPreview"
            @change="set('sidebarPreview', !choices.sidebarPreview); showStack()"
          >
          <span>
            <strong>Preview the Stack as portfolio sidebar</strong>
            <small>360 px wide, next to placeholder page content.</small>
          </span>
        </label>
        <label
          v-for="option in PORTFOLIO"
          :key="option.value"
          class="choices__option"
          :data-on="choices.portfolio === option.value"
        >
          <input
            type="radio"
            name="portfolio"
            :checked="choices.portfolio === option.value"
            @change="set('portfolio', option.value)"
          >
          <span>
            <strong>{{ option.title }}</strong>
            <small>{{ option.text }}</small>
            <span class="choices__flow">
              <template
                v-for="(step, index) in option.flow"
                :key="step"
              >
                <span class="choices__step">{{ step }}</span>
                <span
                  v-if="index < option.flow.length - 1"
                  class="choices__arrow"
                >→</span>
              </template>
            </span>
          </span>
        </label>
      </section>

      <!-- 4 -->
      <section class="choices__section">
        <h3 class="choices__heading">
          4 · Cover editions
        </h3>
        <label
          v-for="option in EDITIONS"
          :key="option.value"
          class="choices__option"
          :data-on="choices.editions === option.value"
        >
          <input
            type="radio"
            name="editions"
            :checked="choices.editions === option.value"
            @change="set('editions', option.value)"
          >
          <span>
            <strong>{{ option.title }}</strong>
            <small>{{ option.text }}</small>
          </span>
        </label>
        <button
          type="button"
          class="choices__button"
          @click="loadEditions"
        >
          {{ editionsOpen ? 'Hide editions' : `Show editions for ${books.length} books` }}
        </button>
        <div
          v-if="editionsOpen"
          class="choices__editions"
        >
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
                    <span
                      v-if="(editions[keyOf(book)] as { auto: string | null }).auto === edition.id"
                      class="choices__badge--auto"
                    >auto</span>
                    {{ edition.released?.slice(0, 4) }}
                  </span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- 5 -->
      <section class="choices__section">
        <h3 class="choices__heading">
          5 · AI back &amp; spine
        </h3>
        <p class="choices__hint">
          {{ withoutBack }} of {{ books.length }} books in this Library have no back yet.
        </p>
        <div class="choices__row">
          <label
            class="choices__option choices__option--card"
            :data-on="choices.ai === 'standard'"
          >
            <input
              type="radio"
              name="ai"
              :checked="choices.ai === 'standard'"
              @change="set('ai', 'standard')"
            >
            <span>
              <strong>Standard</strong>
              <span class="choices__figure">${{ (withoutBack * 0.134).toFixed(2) }}</span>
              <small>$0.134 / book · ~30 s each · right away</small>
            </span>
          </label>
          <label
            class="choices__option choices__option--card"
            :data-on="choices.ai === 'batch'"
          >
            <input
              type="radio"
              name="ai"
              :checked="choices.ai === 'batch'"
              @change="set('ai', 'batch')"
            >
            <span>
              <strong>Batch</strong>
              <span class="choices__figure">${{ (withoutBack * 0.067).toFixed(2) }}</span>
              <small>$0.067 / book · minutes to hours · fine for the nightly job</small>
            </span>
          </label>
        </div>
      </section>

      <section class="choices__section">
        <h3 class="choices__heading">
          Notes
        </h3>
        <textarea
          class="choices__notes"
          rows="4"
          placeholder="Anything else? e.g. “bookmark, but only for 5★”"
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
</style>
