<script setup lang="ts">
import type { LibrarySummary } from '~/composables/useLibrary'

const props = defineProps<{
  summary: LibrarySummary
}>()

const STATUS_LABELS: Record<string, string> = {
  'read': 'read',
  'currently-reading': 'currently reading',
  'to-read': 'to-read',
}

function labelFor(status: string): string {
  return STATUS_LABELS[status] ?? status
}

// Canonical statuses first (in a sensible reading order), then any custom
// exclusive shelves (e.g. "wishlist") in the order they first appear.
const orderedEntries = computed(() => {
  const canonical = ['read', 'currently-reading', 'to-read']
  const entries = Object.entries(props.summary.counts)
  const known = canonical
    .filter(status => status in props.summary.counts)
    .map(status => [status, props.summary.counts[status]!] as const)
  const custom = entries.filter(([status]) => !canonical.includes(status))
  return [...known, ...custom]
})

const pluralBooks = computed(() => props.summary.total === 1 ? 'book' : 'books')
</script>

<template>
  <p
    class="summary"
    role="status"
  >
    {{ summary.total }} {{ pluralBooks }}
    <template
      v-for="([status, count]) in orderedEntries"
      :key="status"
    >
      · {{ count }} {{ labelFor(status) }}
    </template>
  </p>
</template>

<style scoped>
.summary {
  margin: 0;
  font-size: var(--text-md, 0.9rem);
}
</style>
