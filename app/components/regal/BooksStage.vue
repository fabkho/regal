<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the 3D Stack for a host page's body, with the
// picked Book's details card over it. Shares the Library, Stack view, Pick and
// hover with RegalBooksSidebar. Give it a size (height) from the host. A
// library file that can't be shown gets an error card instead of the 3D.
const props = withDefaults(defineProps<{
  /** Sort & filter chips over the 3D (off when RegalBooksSidebar shows them). */
  controls?: boolean
}>(), { controls: false })

useRegalLibrary()
</script>

<template>
  <div class="regal-books-stage">
    <LibraryStage
      class="regal-books-stage__stage"
      stack-only
      show-details
      :show-controls="props.controls"
    />
  </div>
</template>

<style scoped>
.regal-books-stage {
  position: relative;
  display: grid;
  min-height: 24rem;
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-base, 0.85rem);
  line-height: 1.4;
}

.regal-books-stage :deep(*),
.regal-books-stage :deep(*::before),
.regal-books-stage :deep(*::after) {
  box-sizing: border-box;
}

.regal-books-stage__stage {
  min-height: 0;
}
</style>
