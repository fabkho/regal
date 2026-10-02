<script setup lang="ts">
// Details of the Book that's out of the Shelf/Stack: what you'd want to
// remember about it, plus Flip / Put back for people who don't click the 3D.
import { loadDescription } from '#layers/regal/app/utils/covers/descriptions'

const { books } = useLibrary()
const { pickedId, face, flip, putAway } = useBookPick()

const book = computed(() => books.value.find(candidate => candidate.id === pickedId.value) ?? null)

// The card grows out of the Book's label and shrinks back into it
// (composables/useLabelMorph.ts): then it skips its own fade and stays hidden
// until the travelling box arrives. Swapping Books keeps the card: the old
// content goes, the height follows, the new content comes
// (composables/useCardSwap.ts); `shown` is the Book the content shows.
const morph = useLabelMorph()
const root = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
useLabelMorphCard(() => root.value)
const reducedMotion = usePreferredReducedMotion()

/** Blurbs by Book id: the old content keeps its own while it fades out. */
const descriptions = ref<Record<string, string | null>>({})
function loadBlurb(current: NonNullable<typeof book.value>) {
  // The open Book's blurb is wanted now: ahead of every queued load.
  return loadDescription(current, () => -1).then((text) => {
    descriptions.value = { ...descriptions.value, [current.id]: text }
  })
}
watch(book, (current) => {
  if (current && !(current.id in descriptions.value)) void loadBlurb(current)
}, { immediate: true })

const { shown } = useCardSwap({
  source: book,
  card: root,
  body,
  content,
  instant: () => reducedMotion.value === 'reduce' || morph.value.active,
  ready: loadBlurb,
})
const description = computed(() => (shown.value ? descriptions.value[shown.value.id] ?? null : null))
const showSpoiler = ref(false)
watch(() => shown.value?.id, () => {
  showSpoiler.value = false
})

const STATUS_LABELS: Record<string, string> = {
  'read': 'Read',
  'currently-reading': 'Currently reading',
  'to-read': 'To read',
}

const status = computed(() => {
  const value = shown.value?.status ?? ''
  return STATUS_LABELS[value] ?? value.replace(/-/g, ' ')
})

const readOn = computed(() => {
  const date = shown.value?.dateRead
  if (!date) return null
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})

const meta = computed(() => {
  if (!shown.value) return []
  return [
    status.value,
    readOn.value && `Finished ${readOn.value}`,
    shown.value.pages && `${shown.value.pages} pages`,
    shown.value.binding,
  ].filter(Boolean) as string[]
})

/** Goodreads Book Ids are numeric; other sources (Fable via the reading tracker) get a Goodreads search. */
function goodreadsUrl(current: { id: string, isbn13: string | null, title: string, author: string | null }) {
  if (/^\d+$/.test(current.id)) return `https://www.goodreads.com/book/show/${current.id}`
  const query = current.isbn13 ?? [current.title, current.author].filter(Boolean).join(' ')
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`
}
</script>

<template>
  <Transition
    name="details"
    :css="morph.cardFade"
  >
    <article
      v-if="book"
      ref="root"
      class="details"
      :class="{ 'details--morphing': morph.cardHidden }"
      aria-live="polite"
      :aria-label="`${book.title} details`"
    >
      <div
        ref="body"
        class="details__body"
      >
        <div
          v-if="shown"
          ref="content"
          class="details__content"
        >
          <p
            v-if="shown.seriesTitle"
            class="details__series"
          >
            {{ shown.seriesTitle }}
          </p>
          <h2 class="details__title">
            {{ shown.title }}
          </h2>
          <p
            v-if="shown.author"
            class="details__author"
          >
            {{ shown.author }}
          </p>

          <p
            v-if="shown.rating"
            class="details__rating"
            :aria-label="`Rated ${shown.rating} out of 5`"
          >
            <span
              class="details__stars"
              aria-hidden="true"
            >★★★★★<span
              class="details__stars-fill"
              :style="{ width: `${shown.rating / 5 * 100}%` }"
            >★★★★★</span></span>
            <span class="details__rating-value">{{ shown.rating.toFixed(shown.rating % 1 ? 2 : 0).replace(/0$/, '') }}</span>
          </p>

          <p class="details__meta">
            {{ meta.join(' · ') }}
          </p>

          <template v-if="shown.review">
            <button
              v-if="shown.reviewHasSpoiler && !showSpoiler"
              type="button"
              class="details__spoiler"
              @click="showSpoiler = true"
            >
              My review contains spoilers — show
            </button>
            <blockquote
              v-else
              class="details__review"
            >
              {{ shown.review }}
            </blockquote>
          </template>

          <section
            v-if="description"
            class="details__about"
          >
            <h3 class="details__label">
              About
            </h3>
            <p class="details__description">
              {{ description }}
            </p>
          </section>

          <div class="details__actions">
            <button
              type="button"
              class="btn details__button"
              @click="flip"
            >
              {{ face === 'front' ? 'Show back' : 'Show front' }}
            </button>
            <button
              type="button"
              class="btn details__button"
              @click="putAway"
            >
              Put back
            </button>
            <a
              class="details__link"
              :href="goodreadsUrl(shown)"
              target="_blank"
              rel="noopener"
            >Goodreads ↗</a>
          </div>
          <p class="details__hint">
            Drag to turn · click the book to flip · Esc to put back
          </p>
        </div>
      </div>
    </article>
  </Transition>
</template>

<style scoped>
.details {
  box-sizing: border-box;
  padding: 1rem 1.1rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
}

/* Laid out (so the morph can measure it) but not shown until the box arrives. */
.details--morphing {
  visibility: hidden;
}

/* Swapping Books, the content shrinks out and grows in around its top edge. */
.details__content {
  transform-origin: 50% 0;
}

.details__series,
.details__meta,
.details__hint {
  margin: 0;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__title {
  margin: 0.2rem 0 0;
  font-family: var(--font-serif, 'Times New Roman', Times, serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-xl, 1.2rem);
  line-height: 1.2;
}

.details__author {
  margin: 0.15rem 0 0.5rem;
  font-size: var(--text-sm, 0.75rem);
}

.details__rating {
  margin: 0 0 0.35rem;
  color: var(--color-accent, #B93E2E);
  letter-spacing: 0.1em;
}

/* Quarter stars: an accent layer clipped to the rating over a grey row. */
.details__stars {
  position: relative;
  display: inline-block;
  color: var(--color-line, rgba(44, 44, 42, 0.14));
  white-space: nowrap;
}

.details__stars-fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--color-accent, #B93E2E);
}

.details__rating-value {
  margin-left: 0.5em;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0;
}

.details__review {
  margin: 0.6rem 0 0;
  padding-left: 0.75rem;
  border-left: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
  font-size: var(--text-sm, 0.75rem);
  max-height: 8rem;
  overflow: auto;
}

.details__about {
  margin-top: 0.7rem;
  /* A blurb arriving after the content shows fades in while the card grows for it. */
  animation: details-about-in 0.25s ease-out;
}

@keyframes details-about-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .details__about {
    animation: none;
  }
}

.details__label {
  margin: 0 0 0.25rem;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__description {
  margin: 0;
  max-height: 6.5rem;
  overflow: auto;
  font-size: var(--text-xs, 0.7rem);
  line-height: 1.5;
  white-space: pre-line;
}

.details__spoiler {
  margin-top: 0.6rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent, #B93E2E);
  font: inherit;
  font-size: var(--text-sm, 0.75rem);
  cursor: pointer;
  text-decoration: underline;
  text-transform: none;
  letter-spacing: normal;
}

.details__spoiler:hover {
  background: none;
  color: var(--color-accent-light, #E8665A);
}

.details__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin: 0.9rem 0 0.5rem;
}

.details__link {
  color: var(--color-accent, #B93E2E);
  text-decoration: none;
  font-size: var(--text-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Self-contained (the same as Regal's global .btn), so a host app needs no Regal CSS. */
.details__button {
  padding: 0.4rem 0.7rem;
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-subtle, rgba(44, 44, 42, 0.72));
  background: transparent;
  border: 1px solid var(--color-ink, #2C2C2A);
  border-radius: 0;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.details__button:hover {
  color: var(--color-bg, #F5F2EB);
  background: var(--color-ink, #2C2C2A);
}

.details__link:hover {
  text-decoration: underline;
}

.details-enter-active,
.details-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.details-enter-from,
.details-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
