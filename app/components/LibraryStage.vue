<script setup lang="ts">
// The 3D stage. WebGL only runs in the browser, so the canvas is client-only
// and the server renders the fallback below it. Shows the Library either on
// the Bookcase's Shelves or as one Stack; both share the Book meshes and the
// Pick interaction.
import { ACESFilmicToneMapping, SRGBColorSpace, VSMShadowMap } from 'three'
import { TONE_MAPPING_EXPOSURE } from '#layers/regal/app/utils/bookcase/scene'
import { layoutLibrary } from '#layers/regal/app/utils/bookcase/layout'
import { layoutStack } from '#layers/regal/app/utils/stack/layout'
import { applyStackView, resolveGrouping, stackGroups } from '#layers/regal/app/utils/stack/view'
import { SEPARATOR_THICKNESS, SIDE_LABEL_FIT_WIDTH, SIDE_STYLES } from '#layers/regal/app/utils/stack/separators'
import type { ViewMode } from '#layers/regal/app/composables/useBookPick'

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
const debug = computed(() => String(route.query.debug ?? '').split(','))
const debugSlots = computed(() => debug.value.includes('slots'))
/** ?debug=pick exposes the Pick state to browser scripts (BooksPickProbe). */
const debugPick = computed(() => debug.value.includes('pick'))

const { books } = useLibrary()
const { pickedId, putAway } = useBookPick()
const mode = useViewMode()

// ?view=stack deep-links the Stack view; switching views keeps the URL in step.
// A Stack-only page has no views to link.
if (props.stackOnly) mode.value = 'stack'
else if (route.query.view === 'stack' || route.query.view === 'bookcase') mode.value = route.query.view
watch(mode, (value) => {
  if (props.stackOnly) return
  router.replace({ query: { ...route.query, view: value === 'bookcase' ? undefined : value } })
})

const shelves = computed(() => layoutLibrary(books.value))
const { view: stackView } = useStackView()
const stackBooks = computed(() => applyStackView(books.value, stackView.value))
// The decided look; Regal's dev server previews open options (components/dev/Choices.vue).
const look = useLook()
/** Date separators (year / month) between the Books when sorted by date read. */
const stackGrouping = computed(() => resolveGrouping(stackView.value))
const stack = computed(() => layoutStack(stackBooks.value, {
  keepOrder: true,
  groups: stackGroups(stackBooks.value, stackGrouping.value),
  separatorThickness: SEPARATOR_THICKNESS[look.value.separatorStyle],
}))
/** Looks with the date beside the pile need a wider view on narrow stages. */
const stackFitWidth = computed(() => (stack.value.separators.length && SIDE_STYLES.has(look.value.separatorStyle) ? SIDE_LABEL_FIT_WIDTH : undefined))
const poses = computed(() => (mode.value === 'stack' ? stack.value.poses : shelves.value.placements))

const isReady = ref(false)
const showStackControls = computed(() => props.showControls && mode.value === 'stack' && books.value.length > 0)
const hasTop = computed(() => !props.stackOnly || showStackControls.value)

function setMode(value: ViewMode) {
  if (mode.value === value) return
  putAway()
  mode.value = value
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
          :fit-width="stackFitWidth"
          @ready="isReady = true"
        >
          <StackSeparators
            :separators="stack.separators"
            :look="look.separatorStyle"
            :stack-height="stack.height"
          />
          <BooksMeshes
            :poses="poses"
            :books="books"
            :aside="props.showDetails"
            shuffle="animate"
          />
        </StackScene>
        <BooksPickProbe v-if="debugPick" />
      </TresCanvas>

      <template #fallback>
        <p class="stage__status">
          Loading the bookcase…
        </p>
      </template>
    </ClientOnly>

    <!-- The view switch and the Stack controls share a band at the top; in the
         Stack it is paper, so the pile scrolls out underneath it. -->
    <div
      v-if="hasTop"
      class="stage__top"
      :class="{ 'stage__top--band': mode === 'stack' }"
    >
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
        v-if="showStackControls"
        variant="chips"
        class="stage__controls"
      />
    </div>

    <p
      v-if="mode === 'stack' && books.length && !poses.length"
      class="stage__status stage__status--overlay"
    >
      No books match these filters
    </p>

    <BooksHoverLabel />
    <BooksFocusLabel />

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
  color: var(--color-ink-faint, rgba(44, 44, 42, 0.55));
  font-size: var(--text-sm, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stage__status--overlay {
  position: absolute;
  pointer-events: none;
}

.stage__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  pointer-events: none;
}

.stage__top > * {
  pointer-events: auto;
}

/* In the Stack the pile is taller than the view: the band hides what scrolls
   up under the controls, fading out at its lower edge. */
.stage__top--band {
  background: var(--color-bg, #F5F2EB);
  pointer-events: auto;
}

.stage__top--band::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 1.5rem;
  background: linear-gradient(var(--color-bg, #F5F2EB), transparent);
  pointer-events: none;
}

.stage__views {
  display: flex;
  border: 1px solid var(--color-ink, #2C2C2A);
  background: var(--color-bg, #F5F2EB);
}

.stage__view {
  padding: 0.35rem 0.8rem;
  border: 0;
  background: transparent;
  color: var(--color-ink-muted, #6B6B69);
  font: inherit;
  font-size: var(--text-xs, 0.7rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.stage__view + .stage__view {
  border-left: 1px solid var(--color-ink, #2C2C2A);
}

.stage__view[aria-pressed="true"] {
  color: var(--color-bg, #F5F2EB);
  background: var(--color-ink, #2C2C2A);
}

.stage__view:hover:not([aria-pressed="true"]) {
  color: var(--color-accent, #B93E2E);
  background: transparent;
}

.stage__hint {
  position: absolute;
  top: 1.35rem;
  right: 1rem;
  z-index: 3;
  margin: 0;
  color: var(--color-ink-faint, rgba(44, 44, 42, 0.55));
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.stage__controls {
  align-self: stretch;
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
