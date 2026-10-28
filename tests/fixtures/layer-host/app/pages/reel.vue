<script setup lang="ts">
// A reel in a host's card (RegalBooksReel): a Library built in the browser
// from the fixture's synthetic Books (absolute image URLs, as an in-memory
// document needs), next to the shared Library a RegalBooksSidebar loads from
// librarySrc, whose ids are the same (tests/e2e/layer-host.test.ts). The
// host writes what the reel tells it into a list.
import type { RegalLibraryFile } from '#layers/regal/shared/types/libraryFile'

useHead({ title: 'Reel — host' })

const library = ref<RegalLibraryFile | null>(null)
onMounted(() => {
  const at = (path: string) => new URL(path, window.location.href).href
  const titles = ['The Paper Lighthouse', 'A Grammar of Small Moons', 'Notes on Weather', 'The Last Ferry']
  library.value = {
    version: 2,
    generatedAt: '2026-10-28T00:00:00Z',
    owner: 'A friend',
    books: titles.map((title, index) => ({
      id: `fx-00${index + 1}`,
      title: `${title} (hers)`,
      authors: ['Ada Quillfeather'],
      status: 'read',
      rating: 0,
      assets: { color: ['#2F4858', '#B93E2E', '#D4B06A', '#3D6B35'][index], front: at(`/books/fx-00${index + 1}/front.webp`) },
    })),
  }
})
const events = ref<string[]>([])
</script>

<template>
  <div class="reel-host">
    <RegalBooksSidebar class="reel-host__shelf" />
    <section class="reel-host__card">
      <h2>You both read</h2>
      <RegalBooksReel
        :library="library"
        label="Books you both read"
        @ready="events.push('ready')"
        @focus="event => events.push(`focus:${event.id}`)"
        @manual="events.push('manual')"
        @open="event => events.push(`open:${event.id}`)"
      />
      <ol class="reel-host__events">
        <li
          v-for="(event, index) in events"
          :key="index"
        >
          {{ event }}
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.reel-host__card {
  max-width: 430px;
}

.reel-host__shelf {
  max-height: 200px;
  overflow: auto;
}
</style>
