<script setup lang="ts">
// Rating option D (#26): a small label next to the pointer naming the hovered
// Book and its rating.
const props = defineProps<{ enabled: boolean }>()

const hovered = useState<string | null>('books:hovered', () => null)
const { books } = useLibrary()
const { pickedId } = useBookPick()
const book = computed(() => (hovered.value ? books.value.find(item => item.id === hovered.value) : null))
const position = reactive({ x: 0, y: 0 })

function onMove(event: PointerEvent) {
  position.x = event.clientX
  position.y = event.clientY
}

onMounted(() => window.addEventListener('pointermove', onMove))
onBeforeUnmount(() => window.removeEventListener('pointermove', onMove))
</script>

<template>
  <Teleport to="body">
    <p
      v-if="props.enabled && book && !pickedId"
      class="hover-label"
      :style="{ left: `${position.x + 14}px`, top: `${position.y + 14}px` }"
    >
      <span class="hover-label__title">{{ book.title }}</span>
      <span class="hover-label__rating">{{ book.rating ? `★ ${book.rating}` : 'unrated' }}</span>
    </p>
  </Teleport>
</template>

<style scoped>
.hover-label {
  position: fixed;
  z-index: 50;
  display: flex;
  gap: 0.6rem;
  margin: 0;
  padding: 0.3rem 0.55rem;
  font-size: var(--text-xs);
  background: var(--color-bg);
  border: 1px solid var(--color-ink);
  pointer-events: none;
  white-space: nowrap;
}

.hover-label__rating {
  color: var(--color-accent);
}
</style>
