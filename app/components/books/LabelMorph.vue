<script setup lang="ts">
// The box that travels between a Book's label and its details card (see
// composables/useLabelMorph.ts): the label's/card's frame on their surface
// (the host's theme, composables/useRegalUi.ts), with the label text and a
// still copy of the card inside, faded in and out while it moves. Never scales
// its content. Place once, inside the stage.

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
// In <body>: the root's tokens come along.
const surface = useRegalSurface(() => true)
</script>

<template>
  <Teleport to="body">
    <div
      ref="box"
      v-bind="surface"
      class="label-morph"
      aria-hidden="true"
      inert
    >
      <p
        ref="labelLayer"
        class="label-morph__label"
      >
        <BooksHostSlot
          v-if="book"
          name="tooltip"
          :scope="{ book }"
        >
          <BooksTitleStars :book="book" />
        </BooksHostSlot>
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
  /* From the tooltip's surface to the panel's as the card fades in (--_regal-morph-card, 0…1). */
  background: color-mix(in srgb, var(--_regal-surface-raised) calc(var(--_regal-morph-card, 0) * 100%), var(--_regal-surface));
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius);
  box-shadow: var(--_regal-shadow);
  backdrop-filter: var(--_regal-backdrop);
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
  gap: calc(var(--_regal-space) * 0.6);
  width: max-content;
  margin: 0;
  padding: var(--_regal-tooltip-padding);
  color: var(--_regal-ink);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-small);
  border: var(--_regal-border-width) solid transparent;
  white-space: nowrap;
}

.label-morph__label :deep(.title-stars__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-morph__label :deep(.title-stars__rating),
.label-morph__label :deep(.title-stars__unrated) {
  flex-shrink: 0;
}
</style>

<style src="../../assets/css/regal-theme.css"></style>
