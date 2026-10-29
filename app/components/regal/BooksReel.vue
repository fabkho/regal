<script setup lang="ts">
// Embed (Regal as a Nuxt layer): a Library as a Reel for a card in a host page
// (Libellus' "You both read", a portfolio's favourites): the Books standing on
// an arc, one in front square to you, the next one coming forward every 3.2 s
// for one round, then still (libellus plan, section H, variation A). A swipe,
// a tap, an arrow key or the pause button take over; a tap on the Book in
// front takes it out with the Stack's details (components/reel/Card.vue).
//
// Its own Library and its own Pick: the document comes in `library` (the
// library file's format, docs/library-file.md, held in memory; nothing is
// fetched and the shared Library of RegalBooksStage/RegalBooksRow is never
// touched), and a Book out here is out nowhere else, though its id may equal
// one on Your shelf next to it (composables/useBookPick.ts `providePickContext`).
//
// Theming as RegalBooksStage (docs/nuxt-layer.md: "Theming"): `theme`,
// `unstyled`, the `--regal-*` tokens, `#tooltip` (the host's pills and caption
// under the front Book) and the details' `#detail-meta` / `#detail-actions`.
import { h } from 'vue'
import type { Slots } from 'vue'
import type { Book } from '#layers/regal/shared/types/book'
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'
import type { Face } from '#layers/regal/app/utils/books/pick'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'
import { readReelLibrary, reelFacesOf } from '#layers/regal/app/utils/reel/library'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import { createPickContext } from '#layers/regal/app/utils/books/pickContext'
import { REEL_LABELS } from '#layers/regal/app/utils/reel/scene'
import type { ReelLabels } from '#layers/regal/app/utils/reel/scene'
import ReelActions from '#layers/regal/app/components/reel/Actions.vue'
import type ReelCard from '#layers/regal/app/components/reel/Card.vue'
import type { ReelBookEvent } from '#layers/regal/app/utils/reel/context'

const props = withDefaults(defineProps<{
  /**
   * The Library to show, as a document in memory (the library file's format,
   * docs/library-file.md): validated and shown at once, nothing fetched.
   * The reel shows its Books in the document's order. Images: absolute URLs.
   */
  library: RegalLibraryFile | Record<string, unknown> | null
  /** What the reel is, for assistive technology ("Books you both read"). */
  label?: string
  /** The words Regal shows or reads out (pause/play, "Book {n} of {count}", the details' actions …), for a host's language. */
  labels?: Partial<ReelLabels>
  /** Reduce Motion: `true`/`false` override `prefers-reduced-motion` (a host's own setting); unset follows it. */
  reducedMotion?: boolean
  /** Plays one round the first time it shows in a visit; `false`: it starts still (Play plays). */
  autoplay?: boolean
  /** Colour scheme of the card, its caption and the details; default `runtimeConfig.public.regal.theme` ('light'). */
  theme?: RegalTheme
  /** Structure and minimal layout CSS only: no colours, frame or type of Regal's. */
  unstyled?: boolean
  /** Turning a Book taken out: the Stage's turntable (default) or freely about both axes. */
  rotate?: 'free' | 'turntable'
  /** The Books for assistive technology: a visually hidden list of buttons beside the canvas. `false` for a host with its own. */
  accessibleList?: boolean
  /**
   * The reel's own first frame (its Books on the arc, as the canvas will draw them) stands in
   * until the 3D has taken over, so a host draws no poster of its own. `false`: nothing there
   * until the canvas fades in.
   */
  poster?: boolean
  /** Mounts the 3D this many ms later than it would (ms): to look at the poster, e.g. `/dev/reel?slow=1`. */
  canvasDelay?: number
}>(), { label: '', labels: () => ({}), reducedMotion: undefined, autoplay: true, theme: undefined, unstyled: false, rotate: 'turntable', accessibleList: true, poster: true, canvasDelay: 0 })

const emit = defineEmits<{
  /** The first frame with the faces of the Books in view is drawn (show the canvas over a poster now). */
  ready: []
  /** Another Book is in front: the beat, a swipe, a key or a tap brought it. */
  focus: [event: ReelBookEvent]
  /** The reader took over (a swipe, a tap, a key, Pause): the auto-play is over for this visit. */
  manual: []
  /** Open book in the details: the Book was put back at once; open its page. */
  open: [event: ReelBookEvent]
}>()

defineSlots<{
  /** Under the Book in front (the host's pills and caption); faded with the beat (`--regal-reel-badge`). */
  'tooltip'?: (scope: { book: Book, index?: number, count?: number }) => unknown
  /** The details' line under the title (author · her stars · your stars). */
  'detail-meta'?: (scope: { book: Book, meta: string[] }) => unknown
  /** The details' actions (Show back / Put back / Open book); `open` emits `open` and puts the Book back. */
  'detail-actions'?: (scope: { book: Book, close: () => void, flip: () => void, face: Face, open: () => void }) => unknown
}>()

// --- Its own Library -----------------------------------------------------------------

const reelLibrary = computed(() => readReelLibrary(props.library))
const books = computed<Book[]>(() => reelLibrary.value.books)
const error = computed(() => reelLibrary.value.error)

/** A Book's faces, its images resolved against the document (only absolute http(s) URLs load). */
const faces = computed(() => reelFacesOf(props.library, reelLibrary.value.read))
const facesOf = (bookId: string): AssetFaces | null => faces.value(bookId)

// --- Its own Pick, theme and slots ---------------------------------------------------

providePickContext(createPickContext({ books }))

const card = ref<InstanceType<typeof ReelCard> | null>(null)
const words = computed<ReelLabels>(() => ({ ...REEL_LABELS, ...props.labels }))
const hostSlots = useSlots()

/**
 * The host's slots, with the reel's own `#detail-actions` (Show back / Put
 * back / Open book) when the host passes none, and `open` in its scope when it does.
 */
type ActionsScope = { book: Book, close: () => void, flip: () => void, face: Face }
function detailActions(scope: ActionsScope) {
  const open = () => card.value?.openBook()
  const host = hostSlots['detail-actions']
  if (host) return host({ ...scope, open })
  return [h(ReelActions, { face: scope.face, flip: scope.flip, close: scope.close, open, labels: words.value })]
}
const slotNames = () => [...new Set([...Object.keys(hostSlots), 'detail-actions'])]
const slotOf = (name: string | symbol) => (name === 'detail-actions' ? detailActions : hostSlots[name as string])
const slots = new Proxy({} as Slots, {
  get: (_, name) => slotOf(name),
  has: (_, name) => slotNames().includes(name as string),
  ownKeys: () => slotNames(),
  getOwnPropertyDescriptor: (_, name) => (slotNames().includes(name as string) ? { enumerable: true, configurable: true, value: slotOf(name) } : undefined),
})

const root = ref<HTMLElement | null>(null)
const { rootAttrs } = provideRegalUi({
  theme: () => props.theme,
  unstyled: () => props.unstyled,
  root,
  slots,
})
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="regal-books-reel"
  >
    <LibraryFileError
      v-if="error"
      class="regal-books-reel__error"
      :error="error"
    />
    <ReelCard
      v-else-if="books.length"
      ref="card"
      :books="books"
      :faces-of="facesOf"
      :label="props.label"
      :labels="props.labels"
      :reduced-motion="props.reducedMotion"
      :autoplay="props.autoplay"
      :rotate="props.rotate"
      :accessible-list="props.accessibleList"
      :poster="props.poster"
      :canvas-delay="props.canvasDelay"
      @ready="emit('ready')"
      @focus="event => emit('focus', event)"
      @manual="emit('manual')"
      @open="event => emit('open', event)"
    />
    <p
      v-else
      class="regal-books-reel__status"
    >
      No books to show
    </p>
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

.regal-books-reel__error {
  margin: 1rem;
}

.regal-books-reel__status {
  place-self: center;
  margin: 0;
  padding: 2rem 1rem;
  color: var(--_regal-ink-faint);
  font-size: var(--_regal-size-body);
  text-transform: var(--_regal-label-case);
  letter-spacing: var(--_regal-label-tracking);
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
