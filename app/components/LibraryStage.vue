<script setup lang="ts">
// The 3D stage. WebGL only runs in the browser, so the canvas is client-only
// and the server renders the fallback below it. Shows the Library either on
// the Bookcase's Shelves or as one Stack; both share the Book meshes and the
// Pick interaction.
import { ACESFilmicToneMapping, SRGBColorSpace, VSMShadowMap } from 'three'
import { TONE_MAPPING_EXPOSURE } from '~/utils/bookcase/scene'
import { layoutLibrary } from '~/utils/bookcase/layout'
import { justDragged } from '~/utils/books/dragGuard'
import { layoutStack } from '~/utils/stack/layout'
import { applyStackView } from '~/utils/stack/view'
import type { ShuffleStyle } from '~/utils/stack/shuffle'
import type { ViewMode } from '~/composables/useBookPick'

const props = withDefaults(defineProps<{
  /** Sort & filter controls over the 3D (off when a sidebar shows them). */
  showControls?: boolean
  /** The picked Book's details card over the 3D (off when a sidebar shows them). */
  showDetails?: boolean
  /** Hide the Bookcase/Stack switch (a page that only shows the Stack). */
  stackOnly?: boolean
}>(), { showControls: true, showDetails: true, stackOnly: false })

const route = useRoute()
const router = useRouter()
/** Dev-only: ?debug=slots draws a box on every measured ShelfSlot. */
const debugSlots = computed(() => String(route.query.debug ?? '').split(',').includes('slots'))

const { books } = useLibrary()
const { pickedId, putAway } = useBookPick()
const mode = useViewMode()

// ?view=stack deep-links the Stack view; switching views keeps the URL in step.
if (route.query.view === 'stack' || route.query.view === 'bookcase') mode.value = route.query.view
watch(mode, (value) => {
  router.replace({ query: { ...route.query, view: value === 'bookcase' ? undefined : value } })
})

const shelves = computed(() => layoutLibrary(books.value))
const { view: stackView } = useStackView()
const stackBooks = computed(() => applyStackView(books.value, stackView.value))
const stack = computed(() => layoutStack(stackBooks.value, { keepOrder: true }))

// Open design options, previewed live in dev (see components/dev/Choices.vue).
const { choices } = useDevChoices()
if (props.stackOnly) mode.value = 'stack'
/** Re-sort animation: calm 'hand' for small re-sorts, a fancy style for big ones (dev choices). */
const shuffleStyle = computed(() => (import.meta.dev ? choices.value.shuffleFancy : 'carousel') as ShuffleStyle)
const shuffleThreshold = computed(() => (import.meta.dev ? choices.value.shuffleThreshold : 5))
const poses = computed(() => (mode.value === 'stack' ? stack.value.poses : shelves.value.placements))

const isReady = ref(false)

function setMode(value: ViewMode) {
  if (mode.value === value) return
  putAway()
  mode.value = value
}

function onPointerMissed() {
  if (pickedId.value && !justDragged()) putAway()
}

// A Book picked from the list might not exist any more after a new import.
watch(books, (list) => {
  if (pickedId.value && !list.some(book => book.id === pickedId.value)) putAway()
})
</script>

<template>
  <section
    class="stage"
    :aria-label="mode === 'stack' ? 'Book stack' : 'Bookcase'"
    :data-view="mode"
    :data-book-count="poses.length"
    :data-bookcase-count="shelves.bookcaseCount"
    :data-picked="pickedId ?? ''"
  >
    <ClientOnly>
      <TresCanvas
        class="stage__canvas"
        :alpha="true"
        :clear-alpha="0"
        shadows
        :shadow-map-type="VSMShadowMap"
        :tone-mapping="ACESFilmicToneMapping"
        :tone-mapping-exposure="TONE_MAPPING_EXPOSURE"
        :output-color-space="SRGBColorSpace"
        :dpr="[1, 2]"
        @pointermissed="onPointerMissed"
      >
        <BookcaseScene
          v-if="mode === 'bookcase'"
          :debug-slots="debugSlots"
          :bookcase-count="shelves.bookcaseCount"
          @loaded="isReady = true"
        >
          <BooksMeshes
            :poses="poses"
            :books="books"
            :aside="props.showDetails"
          />
        </BookcaseScene>
        <StackScene
          v-else
          :stack-height="stack.height"
          @ready="isReady = true"
        >
          <BooksMeshes
            :poses="poses"
            :books="books"
            :aside="props.showDetails"
            :shuffle="shuffleStyle"
            :shuffle-threshold="shuffleThreshold"
          />
        </StackScene>
      </TresCanvas>

      <template #fallback>
        <p class="stage__status">
          Loading the bookcase…
        </p>
      </template>
    </ClientOnly>

    <div
      v-if="!props.stackOnly"
      class="stage__views"
      role="group"
      aria-label="View"
    >
      <button
        type="button"
        class="stage__view"
        :aria-pressed="mode === 'bookcase'"
        @click="setMode('bookcase')"
      >
        Bookcase
      </button>
      <button
        type="button"
        class="stage__view"
        :aria-pressed="mode === 'stack'"
        @click="setMode('stack')"
      >
        Stack
      </button>
    </div>

    <StackControls
      v-if="props.showControls && mode === 'stack' && books.length"
      variant="chips"
      class="stage__controls"
      :class="{ 'stage__controls--top': props.stackOnly }"
    />
    <p
      v-if="mode === 'stack' && books.length && !poses.length"
      class="stage__status stage__status--overlay"
    >
      No books match these filters
    </p>

    <BooksHoverLabel :variant="choices.label" />

    <p
      v-if="mode === 'stack' && poses.length && !pickedId"
      class="stage__hint"
    >
      Scroll to browse · click a book to take it out
    </p>

    <BooksDetails
      v-if="props.showDetails"
      class="stage__details"
    />

    <p
      v-show="!isReady"
      class="stage__status stage__status--overlay"
      aria-live="polite"
    >
      Loading the bookcase…
    </p>
  </section>
</template>

<style scoped>
.stage {
  position: relative;
  container-type: inline-size;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.stage__canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.stage__status {
  margin: 0;
  color: var(--color-ink-faint);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stage__status--overlay {
  position: absolute;
  pointer-events: none;
}

.stage__views {
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  border: 1px solid var(--color-ink);
  background: var(--color-bg);
}

.stage__view {
  padding: 0.35rem 0.8rem;
  border: 0;
  background: transparent;
  color: var(--color-ink-muted);
  font: inherit;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.stage__view + .stage__view {
  border-left: 1px solid var(--color-ink);
}

.stage__view[aria-pressed="true"] {
  color: var(--color-bg);
  background: var(--color-ink);
}

.stage__view:hover:not([aria-pressed="true"]) {
  color: var(--color-accent);
  background: transparent;
}

.stage__hint {
  position: absolute;
  top: 1.35rem;
  right: 1rem;
  margin: 0;
  color: var(--color-ink-faint);
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.stage__controls {
  position: absolute;
  top: 3.4rem;
  left: 1rem;
  right: 1rem;
  z-index: 2;
}

.stage__controls--top {
  top: 1rem;
}

/* Narrow stages (portfolio sidebar): no room for the hint next to the view switch. */
@container (max-width: 560px) {
  .stage__hint {
    display: none;
  }
}

.stage__details {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  width: min(22rem, calc(100% - 2rem));
}
</style>
