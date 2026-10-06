<script setup lang="ts">
// The owner's shelf: one RegalBooksRow in a phone's card, over the Library
// /warm preloaded (tests/e2e/layer-host.test.ts).
useHead({ title: 'Shelf — host' })
useRuntimeConfig().public.regal.librarySrc = '/books/preload.json'
</script>

<template>
  <RegalBooksRow
    class="shelf__row"
    label="Your shelf"
  />
</template>

<style scoped>
.shelf__row {
  width: 360px;
  height: 288px;
}
</style>
