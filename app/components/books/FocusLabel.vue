<script setup lang="ts">
// The scroll focus label: title and stars of the Book on the Stack's focus
// line (composables/useScrollHighlight.ts), the hover label for scrolling and
// touch (how phones show titles). It sits beside the focused Book's right end;
// where that leaves no room (a phone), it is a caption under the pile.
// Place inside the stage, over the canvas (same origin).

const focused = useFocusedBook()
const anchor = useFocusAnchor()
const { books } = useLibrary()
const { pickedId } = useBookPick()

const book = computed(() => (focused.value ? books.value.find(item => item.id === focused.value) : null))

/** Gap between the Book's end (or the stage edge) and the label, in pixels. */
const GAP = 12
/** Room (px) right of the pile below which the label is a caption; long titles shorten to fit. */
const MIN_ROOM = 220
const room = computed(() => anchor.value.width - anchor.value.x - 2 * GAP)
const beside = computed(() => room.value >= MIN_ROOM)
const style = computed(() => (beside.value
  ? { left: `${anchor.value.x + GAP}px`, top: `${anchor.value.y}px`, maxWidth: `${room.value}px` }
  : {}))

// The label the details card grows out of and shrinks back into
// (composables/useLabelMorph.ts); held back while the box is on its way.
const morph = useLabelMorph()
const label = ref<HTMLElement | null>(null)
useLabelMorphLabel('focus', () => (label.value && book.value ? { bookId: book.value.id, el: label.value } : null))
// The tooltip for scrolling: the host's theme and #tooltip slot (composables/useRegalUi.ts).
const surface = useRegalSurface()
</script>

<template>
  <p
    v-if="book && !pickedId"
    ref="label"
    v-bind="surface"
    class="focus-label"
    :class="{ 'focus-label--caption': !beside, 'focus-label--held': morph.labelsHidden }"
    :style="style"
  >
    <BooksHostSlot
      name="tooltip"
      :scope="{ book }"
    >
      <BooksTitleStars :book="book" />
    </BooksHostSlot>
  </p>
</template>

<style scoped>
.focus-label {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: calc(var(--_regal-space) * 0.6);
  max-width: calc(100% - 2rem);
  margin: 0;
  padding: var(--_regal-tooltip-padding);
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-small);
  background: var(--_regal-surface);
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius);
  box-shadow: var(--_regal-shadow);
  backdrop-filter: var(--_regal-backdrop);
  pointer-events: none;
  white-space: nowrap;
  transform: translateY(-50%);
}

.focus-label :deep(.title-stars__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-label :deep(.title-stars__rating),
.focus-label :deep(.title-stars__unrated) {
  flex-shrink: 0;
}

.focus-label--held {
  visibility: hidden;
}

.focus-label--caption {
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
