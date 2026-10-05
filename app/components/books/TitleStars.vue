<script setup lang="ts">
// A Book's title and its rating in quarter stars: the text of the hover label
// and of the scroll focus label. Inside a `.regal` surface (its tokens).
import type { Book } from '#layers/regal/shared/types/book'

defineProps<{ book: Pick<Book, 'title' | 'rating'> }>()
</script>

<template>
  <span class="title-stars__title">{{ book.title }}</span>
  <span
    v-if="book.rating"
    class="title-stars__stars"
    :aria-label="`Rated ${book.rating} out of 5`"
  >★★★★★<span
    class="title-stars__fill"
    :style="{ width: `${book.rating / 5 * 100}%` }"
  >★★★★★</span></span>
  <span
    v-else
    class="title-stars__unrated"
  >not rated</span>
</template>

<style scoped>
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
</style>
