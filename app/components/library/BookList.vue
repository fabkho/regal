<script setup lang="ts">
import type { Book } from '#layers/regal/shared/types/book'

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

// Choosing a Book here takes it out in the 3D view, same as clicking it there.
const { pickedId, pick, putAway } = useBookPick()

function toggle(bookId: string) {
  if (pickedId.value === bookId) putAway()
  else pick(bookId)
}
</script>

<template>
  <ul
    class="book-list"
    aria-label="Your books"
  >
    <li
      v-for="book in books"
      :key="book.id"
    >
      <button
        type="button"
        class="book-list__item"
        :aria-pressed="pickedId === book.id"
        @click="toggle(book.id)"
      >
        <span class="book-list__title">{{ book.title }}</span>
        <span class="book-list__author">{{ book.author ?? 'Unknown author' }}</span>
        <span class="book-list__status">{{ labelFor(book.status) }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  /* Fallback cap in case an ancestor doesn't constrain height (e.g. very
     long lists): keeps the list scrolling within the panel either way. */
  max-height: min(60dvh, 40rem);
}

.book-list__item {
  width: 100%;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.05rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
}

li:last-child .book-list__item {
  border-bottom: 0;
}

.book-list__item:hover {
  background: var(--color-accent-tint, rgba(185, 62, 46, 0.12));
  color: inherit;
}

.book-list__item:focus-visible {
  outline: 2px solid var(--color-accent, #B93E2E);
  outline-offset: -2px;
}

.book-list__item[aria-pressed="true"] {
  background: var(--color-accent-tint, rgba(185, 62, 46, 0.12));
  box-shadow: inset 2px 0 0 var(--color-accent, #B93E2E);
}

.book-list__title {
  grid-column: 1;
  font-size: var(--text-base, 0.85rem);
}

.book-list__author {
  grid-column: 1;
  font-size: var(--text-xs, 0.7rem);
  color: var(--color-ink-muted, #6B6B69);
}

.book-list__status {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-ink-faint, rgba(44, 44, 42, 0.55));
  white-space: nowrap;
}
</style>
