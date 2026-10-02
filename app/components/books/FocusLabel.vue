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
</script>

<template>
  <p
    v-if="book && !pickedId"
    ref="label"
    class="focus-label"
    :class="{ 'focus-label--caption': !beside, 'focus-label--held': morph.labelsHidden }"
    :style="style"
  >
    <BooksTitleStars :book="book" />
  </p>
</template>

<style scoped>
.focus-label {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  max-width: calc(100% - 2rem);
  margin: 0;
  padding: 0.3rem 0.55rem;
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-xs, 0.7rem);
  background: var(--color-bg, #F5F2EB);
  border: 1px solid var(--color-ink, #2C2C2A);
  pointer-events: none;
  white-space: nowrap;
  transform: translateY(-50%);
}

.focus-label :deep(.title-stars__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-label :deep(.title-stars__stars),
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
