<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the Stack's sort & filters on their own, for
// a host that puts them above the 3D on a phone (RegalBooksSidebar then hides
// its copy). Shares the Stack view with the sidebar and the stage.
const props = withDefaults(defineProps<{
  /** How the filters fit a narrow screen (prototype: pick one). */
  variant?: 'scroll' | 'bar' | 'rows'
}>(), { variant: 'scroll' })

useRegalLibrary()
</script>

<template>
  <StackMobileFilters
    class="regal-books-filters"
    :variant="props.variant"
  />
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
