<script setup lang="ts">
// The details' actions of a Book taken out of a Reel (RegalBooksReel's
// default `#detail-actions`): the Stack's Show back / Put back, and Open book
// instead of Goodreads (the host opens the Book's page on `open`). Inside
// BooksDetails' actions row; self-contained like its buttons (no global CSS).
import type { Face } from '#layers/regal/app/utils/books/pick'

defineProps<{
  face: Face
  flip: () => void
  close: () => void
  open: () => void
  labels: { showBack: string, showFront: string, putBack: string, open: string }
}>()
</script>

<template>
  <button
    type="button"
    class="reel-actions__button"
    @click="flip"
  >
    {{ face === 'front' ? labels.showBack : labels.showFront }}
  </button>
  <button
    type="button"
    class="reel-actions__button"
    @click="close"
  >
    {{ labels.putBack }}
  </button>
  <button
    type="button"
    class="reel-actions__open"
    @click="open"
  >
    {{ labels.open }} →
  </button>
</template>

<style scoped>
.reel-actions__button {
  padding: calc(var(--_regal-space) * 0.4) calc(var(--_regal-space) * 0.7);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-small);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--_regal-ink-subtle);
  background: transparent;
  border: var(--_regal-border-width) solid var(--_regal-border);
  border-radius: var(--_regal-radius-control);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.reel-actions__button:hover {
  color: var(--_regal-surface-raised);
  background: var(--_regal-ink);
}

.reel-actions__open {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--_regal-accent);
  font-family: var(--_regal-font-body);
  font-size: var(--_regal-size-small);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.reel-actions__open:hover {
  text-decoration: underline;
}
</style>
