<script setup lang="ts">
// The text side of the Books page (portfolio layout): header, count, the
// Stack's filters, the Books as plain records and, when chosen, the picked
// Book's details. Records and the 3D Stack are linked both ways: hovering a
// record lifts its Book, clicking it takes the Book out.
const props = withDefaults(defineProps<{
  /** Header line; empty hides it. */
  heading?: string
  /** Under the count of read Books. */
  countLabel?: string
  filters?: boolean
  list?: boolean
  /** Show the picked Book's details here (instead of over the 3D). */
  details?: boolean
}>(), { heading: 'Bookshelf', countLabel: 'Books read', filters: true, list: true, details: false })

const { books, error } = useLibrary()
const { pickedId } = useBookPick()

const readCount = computed(() => books.value.filter(book => book.status === 'read').length)
const showDetails = computed(() => props.details && pickedId.value)
</script>

<template>
  <div class="sidebar">
    <div
      v-if="props.heading"
      class="sidebar__header"
    >
      {{ props.heading }}
    </div>

    <div class="sidebar__section sidebar__stat">
      <div class="sidebar__value">
        {{ readCount }}
      </div>
      <div class="sidebar__label">
        {{ props.countLabel }}
      </div>
    </div>

    <div
      v-if="props.filters"
      class="sidebar__section"
    >
      <StackControls variant="stacked" />
    </div>

    <div
      v-if="error"
      class="sidebar__section"
    >
      <LibraryFileError
        :error="error"
        compact
      />
    </div>

    <div
      v-else-if="showDetails"
      class="sidebar__section sidebar__section--grow"
    >
      <BooksDetails class="sidebar__details" />
    </div>

    <div
      v-else-if="props.list"
      class="sidebar__section sidebar__section--grow"
    >
      <LibraryRecords />
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.sidebar__header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
  font-weight: 600;
  font-size: var(--text-sm, 0.75rem);
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}

.sidebar__section {
  padding: 1rem;
  border-bottom: 1px solid var(--color-ink, #2C2C2A);
}

.sidebar__section--grow {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-bottom: 0;
}

.sidebar__stat {
  text-align: center;
}

.sidebar__value {
  font-family: var(--font-serif, 'Times New Roman', Times, serif);
  font-size: 2.6rem;
  line-height: 1;
}

.sidebar__label {
  margin-top: 0.3rem;
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sidebar__details {
  position: static;
  width: auto;
}
</style>
