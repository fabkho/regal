<script setup lang="ts">
// The Books for assistive tech: Regal draws them in 3D on a canvas, which says
// nothing of them. Beside the canvas this is the same Books as a plain list,
// visually hidden: each a button with its title, author, when it was finished
// and its rating in words ("Dune, Frank Herbert, finished March 2025, 4 of 5
// stars"), which takes the Book out like a tap does. A keyboard gets one Tab
// stop for the whole list and the arrow keys (Home, End) inside it; the button
// in focus shows itself (a small label over the corner) so sighted keyboard
// users see where they are. The host's own list can replace it (`accessible-list`
// off on RegalBooksRow and RegalBooksStage).
import type { Book } from '#layers/regal/shared/types/book'
import { listIndex } from '#layers/regal/app/utils/a11y/focus'
import { bookListLabel } from '#layers/regal/app/utils/books/accessible'

const props = withDefaults(defineProps<{
  /** The Books as they are shown (the row's, the Stack's filtered and sorted ones). */
  books: readonly Book[]
  /** What the list is, for assistive technology. */
  label?: string
}>(), { label: 'Book list' })

const emit = defineEmits<{
  /** A button was pressed: take this Book out. */
  pick: [book: Book]
  /** A button took focus from the keyboard: show this Book. */
  focus: [book: Book]
}>()

const list = ref<HTMLElement | null>(null)
/** The one button on the Tab order (the last one in focus). */
const stop = ref(0)
const tabStop = computed(() => Math.min(stop.value, Math.max(0, props.books.length - 1)))

function buttons(): HTMLButtonElement[] {
  return list.value ? [...list.value.querySelectorAll<HTMLButtonElement>('button')] : []
}

function onFocus(index: number, event: FocusEvent) {
  stop.value = index
  const book = props.books[index]
  if (book && event.target instanceof HTMLElement && event.target.matches(':focus-visible')) emit('focus', book)
}

function onKey(index: number, event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const next = listIndex(props.books.length, index, event.key)
  if (next === null) return
  event.preventDefault()
  buttons()[next]?.focus()
}

function onClick(book: Book, event: MouseEvent) {
  // Safari doesn't focus a button a click lands on: focus it, so it can have focus back when the Book is put away.
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true })
  emit('pick', book)
}
</script>

<template>
  <ul
    v-if="books.length"
    ref="list"
    class="regal-book-list"
    role="list"
    :aria-label="label"
  >
    <li
      v-for="(book, index) in books"
      :key="book.id"
      class="regal-book-list__item"
    >
      <button
        type="button"
        class="regal-book-list__button"
        aria-haspopup="dialog"
        :data-book-id="book.id"
        :tabindex="index === tabStop ? 0 : -1"
        @click="onClick(book, $event)"
        @focus="onFocus(index, $event)"
        @keydown="onKey(index, $event)"
      >
        {{ bookListLabel(book) }}
      </button>
    </li>
  </ul>
</template>

<style scoped>
/* A layer over the canvas that catches nothing: the buttons are out of sight until one has focus. */
.regal-book-list {
  position: absolute;
  inset: 0;
  z-index: 3;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

.regal-book-list__item {
  margin: 0;
  padding: 0;
}

.regal-book-list__button {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  background: none;
  pointer-events: none;
}

.regal-book-list__button:focus-visible {
  bottom: 0.5rem;
  left: 0.5rem;
  width: auto;
  max-width: calc(100% - 1rem);
  height: auto;
  margin: 0;
  padding: 0.35rem 0.6rem;
  overflow: hidden;
  clip-path: none;
  text-overflow: ellipsis;
  border: var(--_regal-border-width, 1px) solid var(--_regal-border, var(--color-ink, #2C2C2A));
  border-radius: var(--_regal-radius, 0);
  background: var(--_regal-surface, var(--color-bg, #F5F2EB));
  color: var(--_regal-ink, var(--color-ink, #2C2C2A));
  font: inherit;
  font-family: var(--_regal-font-body, inherit);
  font-size: var(--_regal-size-small, 0.75rem);
  outline: 2px solid var(--_regal-accent, var(--color-accent, #B93E2E));
  outline-offset: 2px;
  pointer-events: auto;
}
</style>
