<script setup lang="ts">
// The rating on hover: a small label next to the pointer with the hovered
// Book's stars (quarter steps) and, optionally, its title. Only for hovers
// in the 3D view, not for hovering a record in the Book list.
const props = withDefaults(defineProps<{ variant?: 'stars-title' | 'stars' }>(), { variant: 'stars-title' })

const hovered = useState<string | null>('books:hovered', () => null)
const { books } = useLibrary()
const { pickedId } = useBookPick()
const book = computed(() => (hovered.value ? books.value.find(item => item.id === hovered.value) : null))
const position = reactive({ x: 0, y: 0, overCanvas: false })

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
      v-if="book && position.overCanvas && !pickedId"
      class="hover-label"
      :style="{ left: `${position.x + 14}px`, top: `${position.y + 14}px` }"
    >
      <span
        v-if="props.variant === 'stars-title'"
        class="hover-label__title"
      >{{ book.title }}</span>
      <span
        v-if="book.rating"
        class="hover-label__stars"
        :aria-label="`Rated ${book.rating} out of 5`"
      >★★★★★<span
        class="hover-label__fill"
        :style="{ width: `${book.rating / 5 * 100}%` }"
      >★★★★★</span></span>
      <span
        v-else
        class="hover-label__unrated"
      >not rated</span>
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

.hover-label__stars {
  position: relative;
  display: inline-block;
  color: var(--color-line, rgba(44, 44, 42, 0.14));
  letter-spacing: 0.08em;
}

.hover-label__fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  color: var(--color-accent, #B93E2E);
}

.hover-label__unrated {
  color: var(--color-ink-muted, #6B6B69);
}
</style>
