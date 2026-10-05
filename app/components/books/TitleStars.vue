<script setup lang="ts">
// A Book's title and its rating in quarter stars with the number after them
// (4.25: a quarter star is hard to read at this size): the text of the hover
// label, the Stack's scroll focus label and the row's focus label. Inside a
// `.regal` surface (its tokens: the number is muted ink at the label's size).
import type { Book } from '#layers/regal/shared/types/book'
import { ratingText } from '#layers/regal/app/utils/books/rating'

defineProps<{ book: Pick<Book, 'title' | 'rating'> }>()
</script>

<template>
  <span class="title-stars__title">{{ book.title }}</span>
  <span
    v-if="book.rating"
    class="title-stars__rating"
  >
    <span
      class="title-stars__stars"
      :aria-label="`Rated ${ratingText(book.rating)} out of 5`"
    >★★★★★<span
      class="title-stars__fill"
      :style="{ width: `${book.rating / 5 * 100}%` }"
    >★★★★★</span></span>
    <span
      class="title-stars__value"
      aria-hidden="true"
    >{{ ratingText(book.rating) }}</span>
  </span>
  <span
    v-else
    class="title-stars__unrated"
  >not rated</span>
</template>

<style scoped>
/* The stars and their number stay together (a long title truncates instead). */
.title-stars__rating {
  display: inline-flex;
  gap: 0.4em;
  align-items: baseline;
}

.title-stars__stars {
  position: relative;
  display: inline-block;
  color: var(--_regal-hairline);
  letter-spacing: 0.08em;
}

.title-stars__fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--_regal-accent);
}

/* Unstyled (no accent): the track a quarter of the text colour, the fill all of it. */
:where(.regal--unstyled) .title-stars__stars {
  color: inherit;
  -webkit-text-fill-color: color-mix(in srgb, currentColor 25%, transparent);
}

:where(.regal--unstyled) .title-stars__fill {
  -webkit-text-fill-color: currentColor;
}

.title-stars__unrated {
  color: var(--_regal-ink-muted);
}

/* The number: muted, the label's small figures, tabular so 4.25 and 4.5 line up. */
.title-stars__value {
  color: var(--_regal-ink-muted);
  font-size: 0.9em;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
</style>
