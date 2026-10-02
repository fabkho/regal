<script setup lang="ts">
// The standalone viewer's side panel: whose Library the shown file is, its
// counts per Reading status and the Books as a list (choosing one takes it out
// in the 3D), or why the file can't be shown.
const { books, summary, source, error } = useLibrary()

const hasLibrary = computed(() => books.value.length > 0)
</script>

<template>
  <aside
    class="panel"
    aria-label="Library"
  >
    <LibraryFileError
      v-if="error"
      :error="error"
      compact
    />

    <template v-else-if="hasLibrary">
      <div class="panel__header">
        <p
          v-if="source?.owner"
          class="panel__owner"
        >
          {{ source.owner }}'s library
        </p>
        <LibrarySummary :summary="summary" />
      </div>

      <LibraryBookList :books="books" />
    </template>

    <p
      v-else
      class="panel__intro"
    >
      {{ source ? 'This library file has no books.' : 'Loading the library…' }}
    </p>
  </aside>
</template>

<style scoped>
.panel {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
}

.panel__intro {
  margin: 0;
  color: var(--color-ink-subtle, rgba(44, 44, 42, 0.72));
  font-size: var(--text-sm, 0.75rem);
  line-height: 1.5;
}

.panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.panel__owner {
  margin: 0;
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-muted, #6B6B69);
}
</style>
