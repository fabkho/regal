<script setup lang="ts">
// Regal's default caption under the Book in front (the `#tooltip` slot's default,
// in the reel and in its still): the title and the author.
import type { Book } from '#layers/regal/shared/types/book'

defineProps<{ book: Book }>()
</script>

<template>
  <p class="reel-caption">
    <span class="reel-caption__title">{{ book.title }}</span>
    <span
      v-if="book.author"
      class="reel-caption__author"
    >{{ book.author }}</span>
  </p>
</template>

<style scoped>
.reel-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 38px;
  margin: 0;
  padding: 0 1rem;
}

.reel-caption__title {
  max-width: 100%;
  overflow: hidden;
  font-family: var(--_regal-font-title);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reel-caption__author {
  color: var(--_regal-ink-muted);
  font-size: 12px;
  line-height: 1.3;
}
</style>
