<script setup lang="ts">
// Embed (Regal as a Nuxt layer): the text side of a host's Books page, for its
// sidebar: count of read Books, the Stack's sort & filters and the Books as
// records (hover lifts a Book in RegalBooksStage, click takes it out).
const props = withDefaults(defineProps<{
  /** Header line, like the host's other sidebars; '' hides it. */
  heading?: string
  /** Under the count: "12 / books read". */
  countLabel?: string
  /** The sort & filter groups. */
  filters?: boolean
  /** The Books as records. */
  list?: boolean
}>(), { heading: 'Bookshelf', countLabel: 'Books read', filters: true, list: true })

useRegalLibrary()
</script>

<template>
  <LibrarySidebar
    class="regal-books-sidebar"
    :heading="props.heading"
    :count-label="props.countLabel"
    :filters="props.filters"
    :list="props.list"
  />
</template>

<style scoped>
.regal-books-sidebar {
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-base, 0.85rem);
  line-height: 1.4;
}

.regal-books-sidebar :deep(*),
.regal-books-sidebar :deep(*::before),
.regal-books-sidebar :deep(*::after) {
  box-sizing: border-box;
}
</style>
