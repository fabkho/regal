<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the Library as one horizontal row, the Stack
// turned 90°, for a card in a host page (a profile, a year in review). Its
// own Pick: it can share a page with RegalBooksStage or other rows. Give it a
// size from the host (it fills its box; min-height 18rem). A library file
// that can't be shown gets an error card instead of the 3D.
//
// Theming (docs/nuxt-layer.md: "Theming"): the same as RegalBooksStage. The card, its
// labels and buttons, the focus label (the tooltip) and the details (the
// detail panel) read the `--regal-*` tokens, also where they move to <body>
// on break-out; `theme` picks the light/dark set or follows the host,
// `unstyled` leaves only structure and layout, and the slots below replace
// the focus label's and the details' content.
import type { Book } from '#layers/regal/shared/types/book'
import type { Face } from '#layers/regal/app/utils/books/pick'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'
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
  /** Colour scheme of the card, its focus label and details; default `runtimeConfig.public.regal.theme` ('light'). */
  theme?: RegalTheme
  /** Structure and minimal layout CSS only: no colours, frame or type of Regal's. */
  unstyled?: boolean
  /**
   * Regal's Back button while a Book is out. `false` hides it: Escape, the
   * browser's Back, a tap beside the Book and the details' `close` still put
   * it back (a host with its own close in `#detail`). `#back` replaces it.
   */
  backButton?: boolean
  /**
   * Turning a Book taken out: `'free'` spins it about both axes like a
   * trackball (drag up/down tips it, left/right turns it); `'turntable'` turns
   * it left/right and tips it a little (the Stage's).
   */
  rotate?: 'free' | 'turntable'
  /**
   * The Books for assistive technology: a visually hidden list beside the canvas
   * (title, author, month finished, rating in words), each a button that takes the
   * Book out like a tap; it shows the same Books as the row (`limit`, `year`).
   * `false` for a host that renders its own.
   */
  accessibleList?: boolean
}>(), { inspect: 'card', limit: null, year: null, label: '', theme: undefined, unstyled: false, backButton: true, rotate: 'free', accessibleList: true })

defineSlots<{
  /** The focus label's content (title and stars under the Book in focus). */
  'tooltip'?: (scope: { book: Book }) => unknown
  /** The whole details' content. */
  'detail'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face, sheet: boolean }) => unknown
  /** The details' head: title and the line under it. */
  'detail-header'?: (scope: { book: Book }) => unknown
  /** The line under the title (author, date read, stars). */
  'detail-meta'?: (scope: { book: Book, meta: string[] }) => unknown
  /** The blurb (wide cards and broken out); also shown for Books without one when passed. */
  'detail-about'?: (scope: { book: Book, description: string | null }) => unknown
  /** Turn over · drag or flick to turn. */
  'detail-actions'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face }) => unknown
  /** Instead of Regal's Back button while a Book is out (top left of the card, or of the screen broken out). */
  'back'?: (scope: { book: Book, close: () => void, broken: boolean }) => unknown
}>()

useRegalLibrary()
const { books, source, error } = useLibrary()
const shown = computed(() => rowBooks(books.value, { limit: props.limit, year: props.year }))
const ariaLabel = computed(() => props.label || (props.year ? `Books read in ${props.year}` : 'Books read'))

const root = ref<HTMLElement | null>(null)
const { rootAttrs } = provideRegalUi({
  theme: () => props.theme,
  unstyled: () => props.unstyled,
  root,
  slots: useSlots(),
})
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="regal-books-row"
  >
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
      :back-button="props.backButton"
      :rotate="props.rotate"
      :accessible-list="props.accessibleList"
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
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-base);
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
  color: var(--_regal-ink-faint);
  font-size: var(--_regal-size-body);
  text-transform: var(--_regal-label-case);
  letter-spacing: var(--_regal-label-tracking);
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
