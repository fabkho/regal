<script setup lang="ts">
// The box that travels between a Book's label and its details card (see
// composables/useLabelMorph.ts): the label's/card's hairline frame on paper,
// with the label text and a still copy of the card inside, faded in and out
// while it moves. Never scales its content. Place once, inside the stage.

const props = defineProps<{
  /** The stage (a label put back lands inside it). */
  stage: HTMLElement | null
}>()

const box = ref<HTMLElement | null>(null)
const labelLayer = ref<HTMLElement | null>(null)
const cardLayer = ref<HTMLElement | null>(null)
const morph = useLabelMorph()
const { books } = useLibrary()
const book = computed(() => books.value.find(item => item.id === morph.value.labelBookId) ?? null)

useLabelMorphController({ stage: () => props.stage, box, labelLayer, cardLayer })
</script>

<template>
  <Teleport to="body">
    <div
      ref="box"
      class="label-morph"
      aria-hidden="true"
      inert
    >
      <p
        ref="labelLayer"
        class="label-morph__label"
      >
        <BooksTitleStars
          v-if="book"
          :book="book"
        />
      </p>
      <div
        ref="cardLayer"
        class="label-morph__card"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.label-morph {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  display: none;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--color-bg, #F5F2EB);
  border: 1px solid var(--color-ink, #2C2C2A);
  pointer-events: none;
  will-change: transform, width, height;
}

/* Both layers sit where their originals' border boxes start (the box's border is theirs). */
.label-morph__label,
.label-morph__card {
  position: absolute;
  top: -1px;
  left: -1px;
}

.label-morph__card :deep(*),
.label-morph__card :deep(*::before),
.label-morph__card :deep(*::after),
.label-morph__label,
.label-morph__label :deep(*) {
  box-sizing: border-box;
}

/* The label's look (HoverLabel.vue / FocusLabel.vue), with a transparent frame. */
.label-morph__label {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  width: max-content;
  margin: 0;
  padding: 0.3rem 0.55rem;
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-xs, 0.7rem);
  border: 1px solid transparent;
  white-space: nowrap;
}

.label-morph__label :deep(.title-stars__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-morph__label :deep(.title-stars__stars),
.label-morph__label :deep(.title-stars__unrated) {
  flex-shrink: 0;
}
</style>
