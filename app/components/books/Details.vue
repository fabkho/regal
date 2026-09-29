<script setup lang="ts">
// Details of the Book that's out of the Shelf/Stack: what you'd want to
// remember about it, plus Flip / Put back for people who don't click the 3D.
import { loadDescription } from '~/utils/covers/descriptions'

const { books } = useLibrary()
const { pickedId, face, flip, putAway } = useBookPick()

const book = computed(() => books.value.find(candidate => candidate.id === pickedId.value) ?? null)
const showSpoiler = ref(false)
const description = ref<string | null>(null)
watch(book, async (current) => {
  showSpoiler.value = false
  description.value = null
  if (!current) return
  const text = await loadDescription(current)
  if (book.value?.id === current.id) description.value = text
}, { immediate: true })

const STATUS_LABELS: Record<string, string> = {
  'read': 'Read',
  'currently-reading': 'Currently reading',
  'to-read': 'To read',
}

const status = computed(() => {
  const value = book.value?.status ?? ''
  return STATUS_LABELS[value] ?? value.replace(/-/g, ' ')
})

const readOn = computed(() => {
  const date = book.value?.dateRead
  if (!date) return null
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})

const meta = computed(() => {
  if (!book.value) return []
  return [
    status.value,
    readOn.value && `Finished ${readOn.value}`,
    book.value.pages && `${book.value.pages} pages`,
    book.value.binding,
  ].filter(Boolean) as string[]
})
</script>

<template>
  <Transition name="details">
    <article
      v-if="book"
      class="details"
      aria-live="polite"
      :aria-label="`${book.title} details`"
    >
      <p
        v-if="book.seriesTitle"
        class="details__series"
      >
        {{ book.seriesTitle }}
      </p>
      <h2 class="details__title">
        {{ book.title }}
      </h2>
      <p
        v-if="book.author"
        class="details__author"
      >
        {{ book.author }}
      </p>

      <p
        v-if="book.rating"
        class="details__rating"
        :aria-label="`Rated ${book.rating} out of 5`"
      >
        <span aria-hidden="true">{{ '★'.repeat(book.rating) }}<span class="details__rating-rest">{{ '★'.repeat(5 - book.rating) }}</span></span>
      </p>

      <p class="details__meta">
        {{ meta.join(' · ') }}
      </p>

      <template v-if="book.review">
        <button
          v-if="book.reviewHasSpoiler && !showSpoiler"
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
          {{ book.review }}
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
          class="btn"
          @click="flip"
        >
          {{ face === 'front' ? 'Show back' : 'Show front' }}
        </button>
        <button
          type="button"
          class="btn"
          @click="putAway"
        >
          Put back
        </button>
        <a
          class="details__link"
          :href="`https://www.goodreads.com/book/show/${book.id}`"
          target="_blank"
          rel="noopener"
        >Goodreads ↗</a>
      </div>
      <p class="details__hint">
        Drag to turn · click the book to flip · Esc to put back
      </p>
    </article>
  </Transition>
</template>

<style scoped>
.details {
  padding: 1rem 1.1rem;
  border: 1px solid var(--color-ink);
  background: var(--color-bg);
}

.details__series,
.details__meta,
.details__hint {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__title {
  margin: 0.2rem 0 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-xl);
  line-height: 1.2;
}

.details__author {
  margin: 0.15rem 0 0.5rem;
  font-size: var(--text-sm);
}

.details__rating {
  margin: 0 0 0.35rem;
  color: var(--color-accent);
  letter-spacing: 0.1em;
}

.details__rating-rest {
  color: var(--color-line);
}

.details__review {
  margin: 0.6rem 0 0;
  padding-left: 0.75rem;
  border-left: 1px solid var(--color-line);
  font-size: var(--text-sm);
  max-height: 8rem;
  overflow: auto;
}

.details__about {
  margin-top: 0.7rem;
}

.details__label {
  margin: 0 0 0.25rem;
  color: var(--color-ink-muted);
  font-size: var(--text-2xs);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__description {
  margin: 0;
  max-height: 6.5rem;
  overflow: auto;
  font-size: var(--text-xs);
  line-height: 1.5;
  white-space: pre-line;
}

.details__spoiler {
  margin-top: 0.6rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  text-decoration: underline;
  text-transform: none;
  letter-spacing: normal;
}

.details__spoiler:hover {
  background: none;
  color: var(--color-accent-light);
}

.details__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin: 0.9rem 0 0.5rem;
}

.details__link {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
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
