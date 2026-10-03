<script setup lang="ts">
// Why no Library shows: the library file couldn't be loaded or isn't valid.
// Lists the first problems, so a broken export fails loudly instead of
// rendering an empty shelf.
import { shortened } from '#layers/regal/app/utils/library/libraryFile'
import type { LibraryLoadError } from '#layers/regal/app/utils/library/libraryFile'

const props = withDefaults(defineProps<{
  error: LibraryLoadError
  /** The library file's URL. */
  src?: string | null
  /** One line only (a sidebar next to a stage that shows the whole error). */
  compact?: boolean
}>(), { src: null, compact: false })
</script>

<template>
  <div
    class="file-error"
    :class="{ 'file-error--compact': props.compact }"
    role="alert"
  >
    <p class="file-error__label">
      Library unavailable
    </p>
    <p class="file-error__message">
      {{ props.error.message }}
    </p>
    <template v-if="!props.compact">
      <p
        v-if="props.src"
        class="file-error__src"
      >
        {{ shortened(props.src) }}
      </p>
      <ul
        v-if="props.error.details.length"
        class="file-error__details"
      >
        <li
          v-for="(detail, index) in props.error.details"
          :key="index"
        >
          {{ detail }}
        </li>
        <li
          v-if="props.error.more"
          class="file-error__more"
        >
          …and {{ props.error.more }} more
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.file-error {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 34rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-accent, #B93E2E);
  background: var(--color-bg, #F5F2EB);
  color: var(--color-ink, #2C2C2A);
  font-family: var(--font-mono, 'IBM Plex Mono', 'Courier New', Courier, monospace);
  font-size: var(--text-sm, 0.75rem);
  line-height: 1.5;
}

.file-error--compact {
  padding: 0.6rem 0.75rem;
  gap: 0.25rem;
}

.file-error p {
  margin: 0;
}

.file-error__label {
  color: var(--color-accent, #B93E2E);
  font-size: var(--text-2xs, 0.65rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.file-error__src {
  color: var(--color-ink-muted, #6B6B69);
  font-size: var(--text-xs, 0.7rem);
  overflow-wrap: anywhere;
}

.file-error__details {
  margin: 0;
  padding: 0.5rem 0 0 1.1rem;
  border-top: 1px solid var(--color-line, rgba(44, 44, 42, 0.14));
  font-size: var(--text-xs, 0.7rem);
  overflow-wrap: anywhere;
}

.file-error__more {
  color: var(--color-ink-muted, #6B6B69);
  list-style: none;
  margin-left: -1.1rem;
}
</style>
