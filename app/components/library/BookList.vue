<script setup lang="ts">
import type { Book } from '#shared/types/book'

defineProps<{
  books: Book[]
}>()

const STATUS_LABELS: Record<string, string> = {
  'read': 'read',
  'currently-reading': 'currently reading',
  'to-read': 'to-read',
}

function labelFor(status: string): string {
  return STATUS_LABELS[status] ?? status
}
</script>

<template>
  <ul
    class="book-list"
    aria-label="Your books"
    tabindex="0"
  >
    <li
      v-for="book in books"
      :key="book.id"
      class="book-list__item"
    >
      <span class="book-list__title">{{ book.title }}</span>
      <span class="book-list__author">{{ book.author ?? 'Unknown author' }}</span>
      <span class="book-list__status">{{ labelFor(book.status) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-line);
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  /* Fallback cap in case an ancestor doesn't constrain height (e.g. very
     long lists): keeps the list scrolling within the panel either way. */
  max-height: min(60dvh, 40rem);
}

.book-list:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.book-list__item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.05rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-line);
}

.book-list__item:last-child {
  border-bottom: 0;
}

.book-list__item:hover {
  background: var(--color-accent-tint);
}

.book-list__title {
  grid-column: 1;
  font-size: var(--text-base);
}

.book-list__author {
  grid-column: 1;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.book-list__status {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-faint);
  white-space: nowrap;
}
</style>
