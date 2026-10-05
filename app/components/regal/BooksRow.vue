<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the Library as one horizontal row, the Stack
// turned 90°, for a card in a host page (a profile, a year in review). Its
// own Pick: it can share a page with RegalBooksStage or other rows. Give it a
// size from the host (it fills its box; min-height 18rem). A library file
// that can't be shown gets an error card instead of the 3D.
import { rowBooks } from '#layers/regal/app/utils/row/layout'

const props = withDefaults(defineProps<{
  /** Where a picked Book is looked at: in the card, over the whole viewport, or the viewport on narrow screens only. */
  inspect?: 'card' | 'viewport' | 'auto'
  /** Only the newest this many Books (read and being read). */
  limit?: number | null
  /** Only the Books read in this year; the row then starts at January. */
  year?: number | null
  /** What the row is, for assistive technology. */
  label?: string
}>(), { inspect: 'card', limit: null, year: null, label: '' })

useRegalLibrary()
const { books, source, error } = useLibrary()
const shown = computed(() => rowBooks(books.value, { limit: props.limit, year: props.year }))
const ariaLabel = computed(() => props.label || (props.year ? `Books read in ${props.year}` : 'Books read'))
</script>

<template>
  <div class="regal-books-row">
    <LibraryFileError
      v-if="error"
      class="regal-books-row__error"
      :error="error"
      :src="source?.src"
    />
    <RowCard
      v-else-if="shown.length"
      class="regal-books-row__card"
      :books="shown"
      :inspect="props.inspect"
      :start="props.year ? 'oldest' : 'newest'"
      :label="ariaLabel"
    />
    <p
      v-else-if="source"
      class="regal-books-row__status"
    >
      No books to show
    </p>
  </div>
</template>

<style scoped>
.regal-books-row {
  position: relative;
  display: grid;
  min-height: 18rem;
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-base, 0.85rem);
  line-height: 1.4;
}

.regal-books-row :deep(*),
.regal-books-row :deep(*::before),
.regal-books-row :deep(*::after) {
  box-sizing: border-box;
}

.regal-books-row__card {
  min-height: 0;
}

.regal-books-row__error {
  margin: 1rem;
}

.regal-books-row__status {
  place-self: center;
  margin: 0;
  color: var(--color-ink-faint, rgba(44, 44, 42, 0.55));
  font-size: var(--text-sm, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
