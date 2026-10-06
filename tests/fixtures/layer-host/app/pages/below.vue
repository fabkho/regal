<script setup lang="ts">
// A row mounted below the fold (a host that mounts its cards early): its
// intro plays when it scrolls in, `?intro=mount|none` for the other modes
// (tests/e2e/layer-host.test.ts).
useHead({ title: 'Below — host' })
useRuntimeConfig().public.regal.librarySrc = '/books/preload.json'
const route = useRoute()
const intro = route.query.intro === 'mount' || route.query.intro === 'none' ? route.query.intro : 'visible'
</script>

<template>
  <div class="below">
    <p class="below__spacer">
      Scroll down
    </p>
    <RegalBooksRow
      class="below__row"
      label="Below the fold"
      :intro="intro"
    />
    <p class="below__after" />
  </div>
</template>

<style scoped>
.below__spacer {
  height: 2400px;
  margin: 0;
}

.below__row {
  width: 360px;
  height: 288px;
}

.below__after {
  height: 1200px;
  margin: 0;
}
</style>
