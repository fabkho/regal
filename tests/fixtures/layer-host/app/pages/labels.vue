<script setup lang="ts">
// Rows whose months are only a Book or two apart (public/books/close-months.json),
// in a phone's card, a narrow one and a year row: the dates must never run into
// each other (tests/e2e/layer-host.test.ts).
useHead({ title: 'Labels — host' })
// This page's Library instead of the host's default one.
useRuntimeConfig().public.regal.librarySrc = '/books/close-months.json'
</script>

<template>
  <div class="labels">
    <RegalBooksRow
      class="labels__row labels__row--phone"
      label="Phone card"
    />
    <RegalBooksRow
      class="labels__row labels__row--narrow"
      label="Narrow card"
    />
    <RegalBooksRow
      class="labels__row labels__row--phone"
      :year="2026"
      label="Year card"
    />
  </div>
</template>

<style scoped>
.labels {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.labels__row {
  height: 300px;
}

.labels__row--phone {
  width: 360px;
}

.labels__row--narrow {
  width: 220px;
}
</style>
