<script setup lang="ts">
// The Stack's Books as plain text records (same order and filters as the 3D
// Stack). Hovering a record lifts its Book in 3D; clicking takes it out.
// Year / month headers match the Stack's date separators.
import { applyStackView, resolveGrouping, stackGroups } from '#layers/regal/app/utils/stack/view'

const { books } = useLibrary()
const { view } = useStackView()
const { pickedId, pick, putAway } = useBookPick()
const hovered = useState<string | null>('books:hovered', () => null)
const shown = computed(() => applyStackView(books.value, view.value))
/** First Book of each date group → its header. */
const headers = computed(() => new Map(stackGroups(shown.value, resolveGrouping(view.value))
  .map(group => [group.bookIds[0]!, { label: group.label, count: group.bookIds.length }])))

function toggle(bookId: string) {
  if (pickedId.value === bookId) putAway()
  else pick(bookId)
}

const formatDate = (iso: string | null) => (iso
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  : '')
</script>

<template>
  <div class="records">
    <div class="records__count">
      {{ shown.length }} {{ shown.length === 1 ? 'book' : 'books' }}
    </div>
    <template
      v-for="book in shown"
      :key="book.id"
    >
      <div
        v-if="headers.has(book.id)"
        class="records__group"
      >
        <span>{{ headers.get(book.id)!.label }}</span>
        <span class="records__group-count">{{ headers.get(book.id)!.count }}</span>
      </div>
      <button
        type="button"
        class="records__item"
        :aria-pressed="pickedId === book.id"
        @pointerenter="hovered = book.id"
        @pointerleave="hovered = hovered === book.id ? null : hovered"
        @click="toggle(book.id)"
      >
        <span class="records__title">{{ book.title }}</span>
        <span class="records__meta">
          {{ book.author }}<template v-if="book.dateRead"> · {{ formatDate(book.dateRead) }}</template>
        </span>
        <span
          v-if="book.rating"
          class="records__stars"
          :aria-label="`Rated ${book.rating} out of 5`"
        >★★★★★<span
          class="records__stars-fill"
          :style="{ width: `${book.rating / 5 * 100}%` }"
        >★★★★★</span></span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.records__count {
  margin: 0 0 0.6rem;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.records__group {
  display: flex;
  justify-content: space-between;
  margin: 1rem 0 0.2rem;
  padding: 0 0.5rem 0.3rem;
  color: var(--color-ink, #2C2C2A);
  font-size: var(--text-xs, 0.7rem);
  font-weight: 600;
  letter-spacing: 0.1em;
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
}

.records__group-count {
  color: var(--color-accent, #B93E2E);
  font-weight: 400;
}

.records__item {
  display: grid;
  text-transform: none;
  letter-spacing: normal;
  gap: 0.15rem;
  width: 100%;
  margin: 0;
  padding: 0.6rem 0.5rem;
  font: inherit;
  text-align: left;
  color: var(--color-ink, #2C2C2A);
  background: transparent;
  border: 0;
  border-bottom: 1px dashed var(--color-line, rgba(44, 44, 42, 0.14));
  cursor: pointer;
}

.records__item:hover,
.records__item[aria-pressed='true'] {
  color: var(--color-ink, #2C2C2A);
  background: var(--color-accent-tint, rgba(185, 62, 46, 0.12));
}

.records__title {
  font-size: var(--text-sm, 0.75rem);
}

.records__meta {
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
}

.records__stars {
  position: relative;
  justify-self: start;
  color: var(--color-line, rgba(44, 44, 42, 0.14));
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0.08em;
}

.records__stars-fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--color-accent, #B93E2E);
}
</style>
