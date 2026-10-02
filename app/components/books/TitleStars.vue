<script setup lang="ts">
// A Book's title and its rating in quarter stars: the text of the hover label
// and of the scroll focus label.
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
  color: var(--color-line, rgba(44, 44, 42, 0.14));
  letter-spacing: 0.08em;
}

.title-stars__fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--color-accent, #B93E2E);
}

.title-stars__unrated {
  color: var(--color-ink-muted, #6B6B69);
}
</style>
