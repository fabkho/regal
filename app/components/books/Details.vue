<script setup lang="ts">
// Details of the Book that's out of the Shelf/Stack: what you'd want to
// remember about it, plus Flip / Put back for people who don't click the 3D.
// A card; on narrow stages (a phone) a bottom sheet (utils/books/sheet.ts).
import type { SheetSettle, SheetVariant } from '#layers/regal/app/utils/books/sheet'
import { CAPPED_SHARE, OPEN_SHARE } from '#layers/regal/app/utils/books/sheet'

const props = withDefaults(defineProps<{
  /** Show as a bottom sheet of this variant (null: the card). */
  sheet?: SheetVariant | null
  /** The stage's height (px), for the sheet's most height. */
  stageHeight?: number
}>(), { sheet: null, stageHeight: 0 })

const { books } = useLibrary()
const { pickedId, face, flip, putAway } = useBookPick()

const book = computed(() => books.value.find(candidate => candidate.id === pickedId.value) ?? null)

// The card grows out of the Book's label and shrinks back into it
// (composables/useLabelMorph.ts): then it skips its own fade and stays hidden
// until the travelling box arrives. Swapping Books keeps the card: the old
// content goes, the height follows, the new content comes
// (composables/useCardSwap.ts); `shown` is the Book the content shows.
const morph = useLabelMorph()
const root = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
useLabelMorphCard(() => root.value)
const reducedMotion = usePreferredReducedMotion()

const { shown } = useCardSwap({
  source: book,
  card: root,
  body,
  content,
  instant: () => reducedMotion.value === 'reduce' || morph.value.active,
})
/** The blurb, from the library file. */
const description = computed(() => shown.value?.description?.trim() || null)
const showSpoiler = ref(false)
watch(() => shown.value?.id, () => {
  showSpoiler.value = false
})

// --- Bottom sheet (narrow stages) -------------------------------------------

/** Variant a: opened to the whole blurb and the review (kept through a swap, so nothing reflows while it shows). */
const expanded = ref(false)
watch([book, () => props.sheet], ([current]) => {
  if (!current) expanded.value = false
})

/** Variant a: something the compact sheet doesn't show (the blurb past two lines is a guess: any blurb). */
const hasMore = computed(() => !!(description.value || shown.value?.review))

// The cap is on the body, not the sheet: the sheet's height animates
// (useCardSwap) and must not squeeze what it measures. Less the grip and
// the bottom padding, so the whole sheet stays within its share.
const bodyStyle = computed(() => {
  if (!props.sheet || !props.stageHeight) return undefined
  const share = props.sheet === 'b' ? CAPPED_SHARE : props.sheet === 'a' && expanded.value ? OPEN_SHARE : null
  return share ? { maxHeight: `calc(${Math.round(props.stageHeight * share)}px - 2.3rem - env(safe-area-inset-bottom, 0px))` } : undefined
})

function onSettle(settle: SheetSettle) {
  if (settle === 'dismiss') putAway()
  else if (settle === 'expand') expanded.value = true
  else if (settle === 'collapse') expanded.value = false
  else if (settle === 'tap' && props.sheet === 'a' && (expanded.value || hasMore.value)) expanded.value = !expanded.value
}

const { dragging, handlers: grip } = useSheetDrag({
  sheet: root,
  enabled: () => !!props.sheet && !morph.value.cardHidden,
  expandable: () => props.sheet === 'a' && hasMore.value,
  expanded: () => expanded.value,
  onSettle,
})

// A new Book starts at the top of the sheet (its first page, variant c).
const page = ref(0)
watch(() => shown.value?.id, () => {
  page.value = 0
  body.value?.scrollTo({ top: 0 })
  content.value?.scrollTo({ left: 0 })
})

/** Variant c: the pages beside the first one, for the tabs. */
const pages = computed(() => {
  const list = ['Book']
  if (description.value) list.push('About')
  if (shown.value?.review) list.push('Review')
  return list
})

function goToPage(index: number) {
  const element = content.value
  if (!element) return
  element.scrollTo({ left: index * element.clientWidth, behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth' })
}

function onContentScroll() {
  const element = content.value
  if (props.sheet === 'c' && element?.clientWidth) page.value = Math.round(element.scrollLeft / element.clientWidth)
}

// The picked Book floats above the sheet (utils/books/inspect.ts): it tells
// the 3D how tall it is at rest. Opened (variant a) or dragged, it covers the
// Book for a while instead of pushing it around.
const insets = useInspectInsets()
function reportHeight() {
  if (!props.sheet || !root.value || expanded.value || dragging.value) return
  insets.value.bottom = root.value.offsetHeight
}
useResizeObserver(root, reportHeight)
watch(() => props.sheet, (sheet, previous) => {
  if (sheet) nextTick(reportHeight)
  else if (previous) insets.value.bottom = 0
})
onBeforeUnmount(() => {
  if (props.sheet) insets.value.bottom = 0
})

const STATUS_LABELS: Record<string, string> = {
  'read': 'Read',
  'currently-reading': 'Currently reading',
  'to-read': 'To read',
}

const status = computed(() => {
  const value = shown.value?.status ?? ''
  return STATUS_LABELS[value] ?? value.replace(/-/g, ' ')
})

const readOn = computed(() => {
  const date = shown.value?.dateRead
  if (!date) return null
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})

const meta = computed(() => {
  if (!shown.value) return []
  return [
    status.value,
    readOn.value && `Finished ${readOn.value}`,
    shown.value.pages && `${shown.value.pages} pages`,
    shown.value.binding,
  ].filter(Boolean) as string[]
})

/** Goodreads Book Ids are numeric; other sources (Fable via the reading tracker) get a Goodreads search. */
function goodreadsUrl(current: { id: string, isbn13: string | null, title: string, author: string | null }) {
  if (/^\d+$/.test(current.id)) return `https://www.goodreads.com/book/show/${current.id}`
  const query = current.isbn13 ?? [current.title, current.author].filter(Boolean).join(' ')
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`
}
</script>

<template>
  <Transition
    name="details"
    :css="morph.cardFade"
  >
    <article
      v-if="book"
      ref="root"
      class="details"
      :class="{
        'details--morphing': morph.cardHidden,
        'details--sheet': !!props.sheet,
        [`details--sheet-${props.sheet}`]: !!props.sheet,
        'details--expanded': props.sheet === 'a' && expanded,
        'details--dragging': dragging,
      }"
      :data-sheet="props.sheet ?? undefined"
      aria-live="polite"
      :aria-label="`${book.title} details`"
    >
      <!-- The sheet's grip: drag it down to put the Book back (variant a: up to open). -->
      <div
        v-if="props.sheet"
        class="details__grip"
        data-sheet-grip
        v-on="grip"
      >
        <span
          class="details__grip-bar"
          aria-hidden="true"
        />
        <button
          v-if="props.sheet === 'a' && (expanded || hasMore)"
          type="button"
          class="details__sheet-toggle"
          data-sheet-toggle
          :aria-expanded="expanded"
          @pointerdown.stop
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Less ↓' : 'More ↑' }}
        </button>
        <div
          v-else-if="props.sheet === 'c' && pages.length > 1"
          class="details__tabs"
          role="tablist"
        >
          <button
            v-for="(name, index) in pages"
            :key="name"
            type="button"
            role="tab"
            class="details__tab"
            :aria-selected="page === index"
            data-sheet-toggle
            @pointerdown.stop
            @click="goToPage(index)"
          >
            {{ name }}
          </button>
        </div>
      </div>
      <div
        ref="body"
        class="details__body"
        :style="bodyStyle"
      >
        <div
          v-if="shown"
          ref="content"
          class="details__content"
          @scroll.passive="onContentScroll"
        >
          <div class="details__head">
            <p
              v-if="shown.seriesTitle"
              class="details__series"
            >
              {{ shown.seriesTitle }}
            </p>
            <h2 class="details__title">
              {{ shown.title }}
            </h2>
            <p
              v-if="shown.author"
              class="details__author"
            >
              {{ shown.author }}
            </p>

            <p
              v-if="shown.rating"
              class="details__rating"
              :aria-label="`Rated ${shown.rating} out of 5`"
            >
              <span
                class="details__stars"
                aria-hidden="true"
              >★★★★★<span
                class="details__stars-fill"
                :style="{ width: `${shown.rating / 5 * 100}%` }"
              >★★★★★</span></span>
              <span class="details__rating-value">{{ shown.rating.toFixed(shown.rating % 1 ? 2 : 0).replace(/0$/, '') }}</span>
            </p>

            <p class="details__meta">
              {{ meta.join(' · ') }}
            </p>
          </div>

          <div
            v-if="shown.review"
            class="details__opinion"
          >
            <button
              v-if="shown.reviewHasSpoiler && !showSpoiler"
              type="button"
              class="details__spoiler"
              @click="showSpoiler = true"
            >
              My review contains spoilers — show
            </button>
            <blockquote
              v-else
              class="details__review"
            >
              {{ shown.review }}
            </blockquote>
          </div>

          <section
            v-if="description"
            class="details__about"
            @click="props.sheet === 'a' && !expanded && (expanded = true)"
          >
            <h3 class="details__label">
              About
            </h3>
            <p class="details__description">
              {{ description }}
            </p>
          </section>

          <div class="details__actions">
            <button
              type="button"
              class="btn details__button"
              @click="flip"
            >
              {{ face === 'front' ? 'Show back' : 'Show front' }}
            </button>
            <button
              type="button"
              class="btn details__button"
              @click="putAway"
            >
              Put back
            </button>
            <a
              class="details__link"
              :href="goodreadsUrl(shown)"
              target="_blank"
              rel="noopener"
            >Goodreads ↗</a>
          </div>
          <p class="details__hint">
            {{ props.sheet ? 'Drag to turn · tap the book to flip' : 'Drag to turn · click the book to flip · Esc to put back' }}
          </p>
        </div>
      </div>
    </article>
  </Transition>
</template>

<style scoped>
.details {
  box-sizing: border-box;
  padding: 1rem 1.1rem;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
}

/* Laid out (so the morph can measure it) but not shown until the box arrives. */
.details--morphing {
  visibility: hidden;
}

/* Swapping Books, the content shrinks out and grows in around its top edge. */
.details__content {
  transform-origin: 50% 0;
}

.details__series,
.details__meta,
.details__hint {
  margin: 0;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__title {
  margin: 0.2rem 0 0;
  font-family: var(--font-serif, 'Times New Roman', Times, serif);
  font-style: italic;
  font-weight: 400;
  font-size: var(--text-xl, 1.2rem);
  line-height: 1.2;
}

.details__author {
  margin: 0.15rem 0 0.5rem;
  font-size: var(--text-sm, 0.75rem);
}

.details__rating {
  margin: 0 0 0.35rem;
  color: var(--color-accent, #B93E2E);
  letter-spacing: 0.1em;
}

/* Quarter stars: an accent layer clipped to the rating over a grey row. */
.details__stars {
  position: relative;
  display: inline-block;
  color: var(--color-line, rgba(44, 44, 42, 0.14));
  white-space: nowrap;
}

.details__stars-fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--color-accent, #B93E2E);
}

.details__rating-value {
  margin-left: 0.5em;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0;
}

.details__review {
  margin: 0.6rem 0 0;
  padding-left: 0.75rem;
  border-left: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
  font-size: var(--text-sm, 0.75rem);
  max-height: 8rem;
  overflow: auto;
}

.details__about {
  margin-top: 0.7rem;
  /* A blurb arriving after the content shows fades in while the card grows for it. */
  animation: details-about-in 0.25s ease-out;
}

@keyframes details-about-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .details__about {
    animation: none;
  }
}

.details__label {
  margin: 0 0 0.25rem;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-2xs, 0.65rem);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.details__description {
  margin: 0;
  max-height: 6.5rem;
  overflow: auto;
  font-size: var(--text-xs, 0.7rem);
  line-height: 1.5;
  white-space: pre-line;
}

.details__spoiler {
  margin-top: 0.6rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent, #B93E2E);
  font: inherit;
  font-size: var(--text-sm, 0.75rem);
  cursor: pointer;
  text-decoration: underline;
  text-transform: none;
  letter-spacing: normal;
}

.details__spoiler:hover {
  background: none;
  color: var(--color-accent-light, #E8665A);
}

.details__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin: 0.9rem 0 0.5rem;
}

.details__link {
  color: var(--color-accent, #B93E2E);
  text-decoration: none;
  font-size: var(--text-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Self-contained (the same as Regal's global .btn), so a host app needs no Regal CSS. */
.details__button {
  padding: 0.4rem 0.7rem;
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-subtle, rgba(44, 44, 42, 0.72));
  background: transparent;
  border: 1px solid var(--color-ink, #2C2C2A);
  border-radius: 0;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.details__button:hover {
  color: var(--color-bg, #F5F2EB);
  background: var(--color-ink, #2C2C2A);
}

.details__link:hover {
  text-decoration: underline;
}

.details-enter-active,
.details-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.details-enter-from,
.details-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

/* --- Bottom sheet (narrow stages; utils/books/sheet.ts) ---------------------
   Docked to the stage's bottom edge, full width; its side and bottom borders
   sit just outside the stage (LibraryStage), so only the top hairline shows. */
.details--sheet {
  padding: 0 1rem calc(0.7rem + env(safe-area-inset-bottom, 0px));
}

.details--dragging {
  user-select: none;
}

.details__grip {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 1.6rem;
  margin: 0 -1rem;
  padding: 0 1rem;
  touch-action: none;
  cursor: grab;
}

.details--dragging .details__grip {
  cursor: grabbing;
}

.details__grip-bar {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  width: 2.25rem;
  height: 2px;
  background: var(--color-ink-faint, rgba(44, 44, 42, 0.55));
  transform: translateX(-50%);
}

.details__sheet-toggle,
.details__tab {
  padding: 0.25rem 0;
  border: 0;
  background: none;
  color: var(--color-ink-muted, #6B6B69);
  font: inherit;
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.details__sheet-toggle:hover,
.details__tab:hover {
  background: none;
  color: var(--color-accent, #B93E2E);
}

.details__tabs {
  display: flex;
  gap: 0.9rem;
}

.details__tab[aria-selected="true"] {
  color: var(--color-ink, #2C2C2A);
  text-decoration: underline;
  text-decoration-color: var(--color-accent, #B93E2E);
  text-underline-offset: 0.3em;
}

.details--sheet .details__body {
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Title on its own line, author and stars side by side, then the meta. */
.details--sheet .details__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 0.75rem;
  align-items: baseline;
}

.details--sheet .details__series,
.details--sheet .details__title,
.details--sheet .details__meta {
  grid-column: 1 / -1;
}

.details--sheet .details__series,
.details--sheet .details__title,
.details--sheet .details__author {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.details--sheet .details__title {
  margin: 0;
  font-size: var(--text-lg, 1.05rem);
}

.details--sheet .details__author {
  margin: 0.1rem 0 0.15rem;
}

.details--sheet .details__rating {
  grid-column: 2;
  margin: 0;
  font-size: var(--text-sm, 0.75rem);
}

.details--sheet .details__actions {
  flex-wrap: nowrap;
  margin: 0.6rem 0 0;
}

.details--sheet .details__button {
  padding: 0.45rem 0.7rem;
  white-space: nowrap;
}

.details--sheet .details__link {
  margin-left: auto;
  white-space: nowrap;
}

.details--sheet .details__description,
.details--sheet .details__review {
  max-height: none;
  overflow: visible;
}

.details--sheet .details__hint {
  margin-top: 0.75rem;
}

/* a and b: the actions right under the title (they don't move when it opens), the rest below. */
.details--sheet-a .details__content,
.details--sheet-b .details__content {
  display: flex;
  flex-direction: column;
}

.details--sheet-a .details__actions,
.details--sheet-b .details__actions {
  order: 1;
}

.details--sheet-a .details__about,
.details--sheet-b .details__about {
  order: 2;
}

.details--sheet-a .details__opinion,
.details--sheet-b .details__opinion {
  order: 3;
}

.details--sheet-a .details__hint,
.details--sheet-b .details__hint {
  order: 4;
}

/* What scrolls fades out at the sheet's lower edge. */
.details--sheet-b .details__body,
.details--sheet-a.details--expanded .details__body {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.25rem), transparent);
}

.details--sheet-b .details__content,
.details--sheet-a.details--expanded .details__content {
  padding-bottom: 0.75rem;
}

/* a, compact: two lines of the blurb, nothing below; tap them (or More) for the rest. */
.details--sheet-a:not(.details--expanded) .details__label,
.details--sheet-a:not(.details--expanded) .details__opinion,
.details--sheet-a:not(.details--expanded) .details__hint,
.details--sheet-c .details__hint {
  display: none;
}

.details--sheet-a:not(.details--expanded) .details__about {
  margin-top: 0.6rem;
  cursor: pointer;
}

.details--sheet-a:not(.details--expanded) .details__description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

/* c: the first page sets the height; About and Review are pages beside it, scrolling inside. */
.details--sheet-c .details__body {
  overflow: hidden;
}

.details--sheet-c .details__content {
  display: grid;
  grid-template-rows: auto auto;
  grid-auto-columns: 100%;
  grid-auto-flow: column;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.details--sheet-c .details__content::-webkit-scrollbar {
  display: none;
}

.details--sheet-c .details__head {
  grid-area: 1 / 1;
  scroll-snap-align: start;
}

.details--sheet-c .details__actions {
  grid-area: 2 / 1;
}

.details--sheet-c .details__about,
.details--sheet-c .details__opinion {
  grid-row: 1 / span 2;
  contain: size;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-snap-align: start;
}

.details--sheet-c .details__about {
  order: 1;
}

.details--sheet-c .details__opinion {
  order: 2;
}

.details--sheet-c .details__review,
.details--sheet-c .details__spoiler {
  margin-top: 0;
}

/* Without the morph (reduced motion, a pick from the list) the sheet slides in and out. */
.details--sheet.details-enter-from,
.details--sheet.details-leave-to {
  opacity: 1;
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .details--sheet.details-enter-active,
  .details--sheet.details-leave-active {
    transition: none;
  }
}
</style>
