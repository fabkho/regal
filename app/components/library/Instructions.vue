<script setup lang="ts">
</script>

<template>
  <details class="instructions">
    <summary class="instructions__summary">
      How to export from Goodreads
    </summary>
    <ol class="instructions__steps">
      <li>Open Goodreads and go to <strong>My Books</strong>.</li>
      <li>In the left sidebar, choose <strong>Import and export</strong>.</li>
      <li>Click <strong>Export Library</strong> and wait for the download link.</li>
      <li>Drop the downloaded <code>goodreads_library_export.csv</code> here.</li>
    </ol>
  </details>
</template>

<style scoped>
.instructions {
  border: 1px solid var(--color-line);
  padding: 0.6rem 0.8rem;
}

.instructions__summary {
  cursor: pointer;
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-ink-muted);
}

.instructions__summary:hover {
  color: var(--color-ink);
}

.instructions__steps {
  margin: 0.75rem 0 0.15rem;
  padding-left: 1.1rem;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--color-ink-subtle);
}

.instructions__steps code {
  font-size: var(--text-xs);
}
</style>
