<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the reel's first frame as a still, for a host's
// fallbacks (no WebGL, Reduce Motion, Save-Data, an error): the same Books at the
// same places as `RegalBooksReel` draws them before its intro (its own poster is
// this), under it the same caption slot. No canvas, no three.js, no input and no
// script of Regal's beyond this component: it renders on the server.
//
// Give it the props you give the reel (`library`, `autoplay`, `reduced-motion`, `theme`):
// the composition is the reel's first frame for them: the first Book in front, its
// caption and dot, whether or not the reel plays and with or without Reduce Motion
// (Reduce Motion only rests the camera).
import { useSlots } from 'vue'
import type { Book } from '#layers/regal/shared/types/book'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'
import { floorShadowStrength } from '#layers/regal/app/utils/theme/tokens'
import { readReelLibrary, reelFacesOf } from '#layers/regal/app/utils/reel/library'
import { REEL_LABELS, reelShownIndex } from '#layers/regal/app/utils/reel/scene'
import type { ReelLabels } from '#layers/regal/app/utils/reel/scene'
import { reelStartFrame } from '#layers/regal/app/utils/reel/state'

const props = withDefaults(defineProps<{
  /** The Library to show: the same document `RegalBooksReel` is given. */
  library: RegalLibraryFile | Record<string, unknown> | null
  /** What the still is, for assistive technology (default "Books"). */
  label?: string
  /** The words Regal reads out (`reel`), for a host's language. */
  labels?: Partial<ReelLabels>
  /** As the reel's: `true`/`false` override `prefers-reduced-motion`; unset follows it. */
  reducedMotion?: boolean
  /** As the reel's: `false` is a reel that starts still (its first frame rests on the first Book). */
  autoplay?: boolean
  /** Colour scheme; default `runtimeConfig.public.regal.theme` ('light'). */
  theme?: RegalTheme
  /** Structure and minimal layout CSS only: no colours, frame or type of Regal's. */
  unstyled?: boolean
}>(), { label: '', labels: () => ({}), reducedMotion: undefined, autoplay: true, theme: undefined, unstyled: false })

defineSlots<{
  /** Under the Book in front (the host's pills and caption), as the reel's. */
  tooltip?: (scope: { book: Book, index?: number, count?: number }) => unknown
}>()

const reelLibrary = computed(() => readReelLibrary(props.library))
const books = computed<Book[]>(() => reelLibrary.value.books)
const faces = computed(() => reelFacesOf(props.library, reelLibrary.value.read))
const facesOf = (bookId: string) => faces.value(bookId)

const mediaReduced = usePreferredReducedMotion()
const reduced = computed(() => props.reducedMotion ?? mediaReduced.value === 'reduce')
const start = computed(() => reelStartFrame(books.value.length, { reduced: reduced.value, autoplay: props.autoplay }))
const shown = computed(() => reelShownIndex(start.value.focus, books.value.length, false))
const shownBook = computed(() => books.value[shown.value] ?? null)

/** Up to this many Books a dot each, more a count (the reel's). */
const MAX_DOTS = 24

const words = computed<ReelLabels>(() => ({ ...REEL_LABELS, ...props.labels }))
const ariaLabel = computed(() => props.label || words.value.reel)

const root = ref<HTMLElement | null>(null)
const hostSlots = useSlots()
const { ui, rootAttrs } = provideRegalUi({
  theme: () => props.theme,
  unstyled: () => props.unstyled,
  root,
  slots: hostSlots,
})
const shadowStrength = computed(() => floorShadowStrength(ui.tokens.value, ui.scheme.value))
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="regal-books-reel regal-books-reel--still"
  >
    <section
      v-if="books.length"
      class="reel-still"
      :aria-label="ariaLabel"
      :data-front="shown"
      :data-book-count="books.length"
    >
      <div class="reel-still__stage">
        <ReelPoster
          :books="books"
          :faces-of="facesOf"
          :focus="start.focus"
          :time="start.dolly"
          :shadow="shadowStrength"
        />
      </div>
      <div class="reel-still__focus">
        <BooksHostSlot
          v-if="shownBook"
          name="tooltip"
          :scope="{ book: shownBook, index: shown, count: books.length }"
        >
          <ReelCaption :book="shownBook" />
        </BooksHostSlot>
      </div>
      <!-- The dots and count of the reel's controls row (no pause button: nothing moves here). -->
      <div class="reel-still__controls">
        <div
          v-if="books.length > 1 && books.length <= MAX_DOTS"
          class="reel-still__dots"
          aria-hidden="true"
        >
          <i
            v-for="(book, index) in books"
            :key="book.id"
            class="reel-still__dot"
            :class="{ 'reel-still__dot--on': index === shown }"
          />
        </div>
        <p
          v-else-if="books.length > MAX_DOTS"
          class="reel-still__count"
          aria-hidden="true"
        >
          {{ shown + 1 }} / {{ books.length }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.regal-books-reel {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-base);
  line-height: 1.4;
}

.regal-books-reel :deep(*),
.regal-books-reel :deep(*::before),
.regal-books-reel :deep(*::after) {
  box-sizing: border-box;
}

.reel-still {
  position: relative;
  min-width: 0;
  font-size: var(--_regal-size-body);
}

/* As the reel's stage: 330 px tall, the card's full width. */
.reel-still__stage {
  position: relative;
  height: var(--regal-reel-height, 330px);
  overflow: hidden;
}

/* As the reel's slot under the Book in front. */
.reel-still__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  margin-top: 2px;
}

.reel-still__count {
  margin: 0;
  color: var(--_regal-ink-faint);
  font-size: var(--_regal-size-small);
  font-variant-numeric: tabular-nums;
}

.reel-still__dots {
  display: flex;
  gap: 5px;
}

.reel-still__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--_regal-hairline);
}

.reel-still__dot--on {
  width: 14px;
  border-radius: 3px;
  background: var(--_regal-ink);
}

.reel-still__focus {
  position: relative;
  z-index: 1;
  margin-top: calc(-1 * var(--regal-reel-overlap, calc(46px + var(--regal-reel-rise, 40px))));
  min-height: var(--regal-reel-overlap, calc(46px + var(--regal-reel-rise, 40px)));
  text-align: center;
  pointer-events: none;
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
