<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the Stack's sort & filter as one bar, for a host
// that puts them above the 3D on a phone (RegalBooksSidebar's copy, class
// `sidebar__filters`, is then hidden by the host). The bar is `--regal-filter-bar-height`
// tall (2.8rem) so the host can size the pile below it; its panel opens over
// the page. Shares the Stack view with the sidebar and the stage.
useRegalLibrary()
</script>

<template>
  <StackFilterBar class="regal-books-filters" />
</template>

<style scoped>
.regal-books-filters {
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  line-height: 1.4;
}

.regal-books-filters :deep(*),
.regal-books-filters :deep(*::before),
.regal-books-filters :deep(*::after) {
  box-sizing: border-box;
}
</style>
