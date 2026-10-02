<script setup lang="ts">
// The rating on hover: a small label next to the pointer with the hovered
// Book's title and stars (quarter steps). Only for hovers in the 3D view, not
// for hovering a record in the Book list, and not once the user scrolls (the
// scroll focus label takes over, see FocusLabel.vue).

const hovered = useState<string | null>('books:hovered', () => null)
const { books } = useLibrary()
const { pickedId } = useBookPick()
const { scrollLed } = useScrollLead()
const book = computed(() => (hovered.value ? books.value.find(item => item.id === hovered.value) : null))
const position = reactive({ x: 0, y: 0, overCanvas: false })

// Taking the Book out, this label grows into the details card; putting it
// back, the card shrinks into it again (composables/useLabelMorph.ts). Held
// back (laid out, not shown) while the box is on its way, and while a Book is
// out: then it still marks where a click swapping Books happened.
const morph = useLabelMorph()
const label = ref<HTMLElement | null>(null)
useLabelMorphLabel('hover', () => (label.value && book.value ? { bookId: book.value.id, el: label.value } : null))

function onMove(event: PointerEvent) {
  position.x = event.clientX
  position.y = event.clientY
  position.overCanvas = event.target instanceof HTMLCanvasElement
}

onMounted(() => window.addEventListener('pointermove', onMove))
onBeforeUnmount(() => window.removeEventListener('pointermove', onMove))
</script>

<template>
  <Teleport to="body">
    <p
      v-if="book && position.overCanvas && !scrollLed"
      ref="label"
      class="hover-label"
      :class="{ 'hover-label--held': morph.labelsHidden || pickedId }"
      :style="{ left: `${position.x + 14}px`, top: `${position.y + 14}px` }"
    >
      <BooksTitleStars :book="book" />
    </p>
  </Teleport>
</template>

<style scoped>
.hover-label {
  position: fixed;
  z-index: 50;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0;
  padding: 0.3rem 0.55rem;
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-xs, 0.7rem);
  background: var(--color-bg, #F5F2EB);
  border: 1px solid var(--color-ink, #2C2C2A);
  pointer-events: none;
  white-space: nowrap;
}

.hover-label--held {
  visibility: hidden;
}
</style>
