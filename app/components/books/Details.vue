<script setup lang="ts">
// Details of the Book that's out of the Shelf/Stack: what you'd want to
// remember about it, plus Flip / Put back for people who don't click the 3D.
// A card; on narrow stages (a phone) a bottom sheet (utils/books/sheet.ts),
// placed by the stage on the viewport's bottom edge. Its look is the host's
// theme (the `--regal-*` tokens), its content can be the host's slots
// (docs/nuxt-layer.md: "Theming"); the frame, the swap, the sheet and the morph stay Regal's.
import { ratingText } from '#layers/regal/app/utils/books/rating'

const props = withDefaults(defineProps<{
  /** Show as a bottom sheet (narrow stages) instead of the card. */
  sheet?: boolean
  /** The sheet's most height, px (utils/books/sheet.ts sheetMaxHeight). */
  maxHeight?: number
}>(), { sheet: false, maxHeight: 0 })

const { books } = useLibrary()
const { pickedId, face, flip, putAway } = useBookPick()

const book = computed(() => books.value.find(candidate => candidate.id === pickedId.value) ?? null)

// The host's theme and slots (#detail, #detail-header, #detail-meta,
// #detail-about, #detail-actions; composables/useRegalUi.ts). The sheet lives
// in <body>: the root's tokens come along.
const ui = useRegalUi()
const surface = useRegalSurface(() => props.sheet)

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

// At most maxHeight. The head and the actions always show; the blurb and
// the review below them scroll inside, in what is left of maxHeight. Set
// in px from what the rest measures rather than by flex: the sheet's height
// animates (useCardSwap) and must not squeeze what it measures.
const gripElement = ref<HTMLElement | null>(null)
const more = ref<HTMLElement | null>(null)
const moreMax = ref(0)
/** The scrolling part never gets shorter than this (px): on a tiny screen the sheet grows instead. */
const MORE_MIN = 48
/** The host's own panel (#detail) in the sheet: its most height, px. */
const contentMax = ref(0)
function fitMore() {
  const card = root.value
  if (!props.sheet || !props.maxHeight || !card || !content.value) {
    moreMax.value = 0
    contentMax.value = 0
    return
  }
  const style = getComputedStyle(card)
  const frame = (gripElement.value?.offsetHeight ?? 0) + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
  // The host's own panel (#detail) scrolls as a whole.
  contentMax.value = ui.hasSlot('detail') ? Math.max(MORE_MIN, Math.floor(props.maxHeight - frame)) : 0
  const rest = content.value.offsetHeight - (more.value?.offsetHeight ?? 0)
  moreMax.value = Math.max(MORE_MIN, Math.floor(props.maxHeight - frame - rest))
}
const moreStyle = computed(() => (props.sheet && moreMax.value ? { maxHeight: `${moreMax.value}px` } : undefined))
const contentStyle = computed(() => (props.sheet && contentMax.value ? { maxHeight: `${contentMax.value}px` } : undefined))
watch(() => [props.sheet, props.maxHeight], () => nextTick(fitMore))

const { dragging, handlers: grip } = useSheetDrag({
  sheet: root,
  enabled: () => props.sheet && !morph.value.cardHidden,
  onSettle: (settle) => {
    if (settle === 'dismiss') putAway()
  },
})

/** More of the blurb below the sheet's scrolling part: it fades out there. */
const moreBelow = ref(false)
function checkBelow() {
  const element = more.value
  moreBelow.value = props.sheet && !!element && element.scrollTop + element.clientHeight < element.scrollHeight - 1
}
useResizeObserver([content, more], () => {
  fitMore()
  checkBelow()
})

// A new Book starts at the top of its blurb.
watch(() => shown.value?.id, () => {
  more.value?.scrollTo({ top: 0 })
  checkBelow()
})

// The picked Book floats above the sheet (utils/books/inspect.ts): it tells
// the stage where its top edge rests. Dragged or sliding in, it covers the
// Book for a moment instead of pushing it around. Put away, the last place
// stays, so a Book on its way back doesn't change course.
const insets = useInspectInsets()
const entering = ref(false)
function reportTop() {
  if (!props.sheet || !root.value || dragging.value || entering.value) return
  insets.value.sheetTop = root.value.getBoundingClientRect().top
}
useResizeObserver(root, reportTop)
// The sheet sits on the viewport's bottom edge: a viewport resize (the
// browser's toolbar coming and going) moves it without resizing it.
useEventListener('resize', reportTop, { passive: true })
watch(() => props.sheet, (sheet, previous) => {
  if (sheet) nextTick(reportTop)
  else if (previous) insets.value.sheetTop = null
})
onBeforeUnmount(() => {
  if (props.sheet) insets.value.sheetTop = null
})
function onEntered() {
  entering.value = false
  reportTop()
}

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
    @before-enter="entering = morph.cardFade"
    @after-enter="onEntered"
    @enter-cancelled="onEntered"
  >
    <article
      v-if="book"
      ref="root"
      v-bind="surface"
      class="details"
      :class="{
        'details--morphing': morph.cardHidden,
        'details--sheet': props.sheet,
        'details--dragging': dragging,
        'details--more-below': moreBelow,
      }"
      aria-live="polite"
      :aria-label="`${book.title} details`"
    >
      <!-- The sheet's grip: drag it down to put the Book back. -->
      <div
        v-if="props.sheet"
        ref="gripElement"
        class="details__grip"
        aria-hidden="true"
        v-on="grip"
      >
        <span class="details__grip-bar" />
      </div>
      <div
        ref="body"
        class="details__body"
      >
        <div
          v-if="shown"
          ref="content"
          class="details__content"
          :class="{ 'details__content--custom': ui.hasSlot('detail') }"
          :style="contentStyle"
        >
          <!-- The host's whole panel (#detail); Regal keeps the frame, the sheet,
               the swap and the morph around it. -->
          <BooksHostSlot
            v-if="ui.hasSlot('detail')"
            name="detail"
            :scope="{ book: shown, close: putAway, flip, face, sheet: props.sheet }"
          />
          <template v-else>
            <div
              class="details__head"
              :class="{ 'details__head--custom': ui.hasSlot('detail-header') }"
            >
              <BooksHostSlot
                name="detail-header"
                :scope="{ book: shown }"
              >
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
                  <span class="details__rating-value">{{ ratingText(shown.rating) }}</span>
                </p>

                <div
                  v-if="ui.hasSlot('detail-meta')"
                  class="details__meta-slot"
                >
                  <BooksHostSlot
                    name="detail-meta"
                    :scope="{ book: shown, meta }"
                  />
                </div>
                <p
                  v-else
                  class="details__meta"
                >
                  {{ meta.join(' · ') }}
                </p>
              </BooksHostSlot>
            </div>

            <!-- The sheet keeps the head and the actions in view; this part scrolls. -->
            <div
              v-if="shown.review || description || ui.hasSlot('detail-about')"
              ref="more"
              class="details__more"
              :style="moreStyle"
              @scroll.passive="checkBelow"
            >
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
                v-if="description || ui.hasSlot('detail-about')"
                class="details__about"
              >
                <BooksHostSlot
                  name="detail-about"
                  :scope="{ book: shown, description }"
                >
                  <h3 class="details__label">
                    About
                  </h3>
                  <p class="details__description">
                    {{ description }}
                  </p>
                </BooksHostSlot>
              </section>
            </div>

            <div class="details__actions">
              <BooksHostSlot
                name="detail-actions"
                :scope="{ book: shown, close: putAway, flip, face }"
              >
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
              </BooksHostSlot>
            </div>
            <p
              v-if="!props.sheet"
              class="details__hint"
            >
              Drag to turn · click the book to flip · Esc to put back
            </p>
          </template>
        </div>
      </div>
    </article>
  </Transition>
</template>

<style scoped>
.details {
  box-sizing: border-box;
  padding: var(--_regal-panel-padding);
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius);
  background: var(--_regal-surface-raised);
  box-shadow: var(--_regal-shadow);
  backdrop-filter: var(--_regal-backdrop);
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-base);
  line-height: 1.4;
}

/* Laid out (so the morph can measure it) but not shown until the box arrives. */
.details--morphing {
  visibility: hidden;
}

/* Swapping Books, the content shrinks out and grows in around its top edge. */
.details__content {
  transform-origin: 50% 0;
}

.details__meta-slot {
  margin: 0;
}

.details__series,
.details__meta,
.details__hint {
  margin: 0;
  color: var(--_regal-ink-muted);
  font-size: var(--_regal-size-label);
  text-transform: var(--_regal-label-case);
  letter-spacing: var(--_regal-label-tracking);
}

.details__title {
  margin: calc(var(--_regal-space) * 0.2) 0 0;
  font-family: var(--_regal-font-title);
  font-style: var(--_regal-style-title);
  font-weight: var(--_regal-weight-title);
  font-size: var(--_regal-size-title);
  line-height: 1.2;
}

.details__author {
  margin: calc(var(--_regal-space) * 0.15) 0 calc(var(--_regal-space) * 0.5);
  font-size: var(--_regal-size-body);
}

.details__rating {
  margin: 0 0 calc(var(--_regal-space) * 0.35);
  color: var(--_regal-accent);
  letter-spacing: 0.1em;
}

/* Quarter stars: an accent layer clipped to the rating over a grey row. */
.details__stars {
  position: relative;
  display: inline-block;
  color: var(--_regal-hairline);
  white-space: nowrap;
}

.details__stars-fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--_regal-accent);
}

/* Unstyled (no accent): the track a quarter of the text colour, the fill all of it. */
.regal--unstyled .details__stars {
  color: inherit;
  -webkit-text-fill-color: color-mix(in srgb, currentColor 25%, transparent);
}

.regal--unstyled .details__stars-fill {
  -webkit-text-fill-color: currentColor;
}

.details__rating-value {
  margin-left: 0.5em;
  color: var(--_regal-ink-muted);
  font-size: var(--_regal-size-small);
  letter-spacing: 0;
}

.details__review {
  margin: calc(var(--_regal-space) * 0.6) 0 0;
  padding-left: calc(var(--_regal-space) * 0.75);
  border-left: 1px solid var(--_regal-hairline);
  font-size: var(--_regal-size-body);
  max-height: 8rem;
  overflow: auto;
}

.details__about {
  margin-top: calc(var(--_regal-space) * 0.7);
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
  margin: 0 0 calc(var(--_regal-space) * 0.25);
  color: var(--_regal-ink-muted);
  font-size: var(--_regal-size-label);
  font-weight: var(--_regal-weight-label);
  text-transform: var(--_regal-label-case);
  letter-spacing: var(--_regal-label-tracking);
}

.details__description {
  margin: 0;
  max-height: 6.5rem;
  overflow: auto;
  font-size: var(--_regal-size-small);
  line-height: 1.5;
  white-space: pre-line;
}

.details__spoiler {
  margin-top: calc(var(--_regal-space) * 0.6);
  padding: 0;
  border: 0;
  background: none;
  color: var(--_regal-accent);
  font: inherit;
  font-size: var(--_regal-size-body);
  cursor: pointer;
  text-decoration: underline;
  text-transform: none;
  letter-spacing: normal;
}

.details__spoiler:hover {
  background: none;
  color: var(--_regal-accent-hover);
}

.details__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--_regal-space) * 0.5) calc(var(--_regal-space) * 0.75);
  margin: calc(var(--_regal-space) * 0.9) 0 calc(var(--_regal-space) * 0.5);
}

.details__link {
  color: var(--_regal-accent);
  text-decoration: none;
  font-size: var(--_regal-size-small);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Self-contained (the same as Regal's global .btn), so a host app needs no Regal CSS. */
.details__button {
  padding: calc(var(--_regal-space) * 0.4) calc(var(--_regal-space) * 0.7);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-small);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--_regal-ink-subtle);
  background: transparent;
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius-control);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.details__button:hover {
  color: var(--_regal-surface-raised);
  background: var(--_regal-ink);
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
   On the viewport's bottom edge, full width, out of the stage (LibraryStage
   teleports it to <body>); its side and bottom borders sit just outside the
   viewport, so only the top hairline shows. Out of the stage it brings its
   own type (what RegalBooksStage gives its content). */
.details--sheet {
  padding: 0 calc(var(--_regal-space) * 1) calc(calc(var(--_regal-space) * 0.7) + env(safe-area-inset-bottom, 0px));
}

.details--sheet,
.details--sheet *,
.details--sheet *::before,
.details--sheet *::after {
  box-sizing: border-box;
}

.details--dragging {
  user-select: none;
}

.details__grip {
  position: relative;
  height: 1.6rem;
  margin: 0 calc(var(--_regal-space) * -1);
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
  background: var(--_regal-ink-faint);
  transform: translateX(-50%);
}

/* Title on its own line, author and stars side by side, then the meta. */
.details--sheet .details__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: calc(var(--_regal-space) * 0.75);
  align-items: baseline;
}

.details--sheet .details__series,
.details--sheet .details__title,
.details--sheet .details__meta,
.details--sheet .details__meta-slot {
  grid-column: 1 / -1;
}

/* The host's header (#detail-header) lays itself out. */
.details--sheet .details__head--custom {
  display: block;
}

/* The host's whole panel (#detail) scrolls inside the sheet's height. */
.details--sheet .details__content--custom {
  overflow-y: auto;
  overscroll-behavior: contain;
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
  font-size: var(--_regal-size-title-sheet);
}

.details--sheet .details__author {
  margin: calc(var(--_regal-space) * 0.1) 0 calc(var(--_regal-space) * 0.15);
}

.details--sheet .details__rating {
  grid-column: 2;
  margin: 0;
  font-size: var(--_regal-size-body);
}

.details--sheet .details__actions {
  flex-wrap: nowrap;
  margin: calc(var(--_regal-space) * 0.6) 0 0;
}

.details--sheet .details__button {
  padding: calc(var(--_regal-space) * 0.45) calc(var(--_regal-space) * 0.7);
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

/* Head and actions stay in view (the actions right under the title, in
   reach); the blurb, then the review, scroll below them. */
.details--sheet .details__content {
  display: flex;
  flex-direction: column;
}

.details--sheet .details__actions {
  order: 1;
}

.details--sheet .details__more {
  order: 2;
  display: flex;
  flex-direction: column;
  margin-top: calc(var(--_regal-space) * 0.75);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.details--sheet .details__about {
  order: 1;
  margin-top: 0;
}

.details--sheet .details__opinion {
  order: 2;
}

/* What is still below fades out at the scrolling part's lower edge. */
.details--more-below .details__more {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.25rem), transparent);
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

<style src="../../assets/css/regal-theme.css"></style>
