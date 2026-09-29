<script setup lang="ts">
const { books, summary, warnings, error, importFile, loadDemo, clear } = useLibrary()
/** Dev-only test Libraries. */
const isDev = import.meta.dev

const hasLibrary = computed(() => books.value.length > 0)

function onFile(file: File) {
  importFile(file)
}
</script>

<template>
  <aside
    class="panel"
    aria-label="Library"
  >
    <template v-if="!hasLibrary">
      <p class="panel__intro">
        Drop your Goodreads library export to fill the bookcase, or start with a demo.
      </p>

      <LibraryDropzone @file="onFile">
        <template #actions>
          <button
            type="button"
            class="btn"
            @click="loadDemo()"
          >
            Try demo library
          </button>
          <button
            v-if="isDev"
            type="button"
            class="btn"
            @click="loadDemo('sun-eater')"
          >
            Sun Eater (dev)
          </button>
        </template>
      </LibraryDropzone>

      <p
        v-if="error"
        class="panel__error"
        role="alert"
      >
        {{ error }}
      </p>

      <LibraryInstructions />
    </template>

    <template v-else>
      <div class="panel__header">
        <LibrarySummary :summary="summary" />
        <div class="panel__header-actions">
          <button
            type="button"
            class="btn btn--danger"
            @click="clear"
          >
            Clear
          </button>
        </div>
      </div>

      <p class="panel__replace-label">
        Replace library
      </p>
      <LibraryDropzone
        class="panel__replace"
        @file="onFile"
      />

      <p
        v-if="error"
        class="panel__error"
        role="alert"
      >
        {{ error }}
      </p>

      <details
        v-if="warnings.length"
        class="panel__warnings"
      >
        <summary>{{ warnings.length }} row{{ warnings.length === 1 ? '' : 's' }} skipped</summary>
        <ul>
          <li
            v-for="(warning, index) in warnings"
            :key="index"
          >
            {{ warning }}
          </li>
        </ul>
      </details>

      <LibraryBookList :books="books" />
    </template>
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
  color: var(--color-ink-subtle);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.panel__header-actions {
  display: flex;
  gap: 0.5rem;
}

.panel__replace-label {
  margin: 0;
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-muted);
}

.panel__replace {
  padding: 0.6rem 0.75rem;
}

.panel__replace :deep(.dropzone__hint) {
  display: none;
}

.panel__error {
  margin: 0;
  border: 1px solid var(--color-accent);
  background: var(--color-accent-tint);
  color: var(--color-accent);
  padding: 0.6rem 0.75rem;
  font-size: var(--text-sm);
}

.panel__warnings {
  border: 1px solid var(--color-line);
  padding: 0.5rem 0.75rem;
  font-size: var(--text-xs);
  color: var(--color-ink-muted);
}

.panel__warnings summary {
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.panel__warnings ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  max-height: 8rem;
  overflow-y: auto;
}
</style>
