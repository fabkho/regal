<script setup lang="ts">
// A host's Home: the owner's shelf is likely next, so Regal is warmed on idle
// (preloadRegal through a dynamic import, as a host that keeps Regal in its
// own chunk would), before any row exists. /shelf shows the row
// (tests/e2e/layer-host.test.ts).
useHead({ title: 'Home — host' })
const SRC = '/books/preload.json'
useRuntimeConfig().public.regal.librarySrc = SRC
const warmed = ref(false)
onMounted(async () => {
  const { preloadRegal } = await import('#layers/regal/app/utils/preload')
  await preloadRegal({ src: SRC, width: 360, height: 288 })
  // Safe to call again: the same warm-up.
  await preloadRegal({ src: SRC, width: 360, height: 288 })
  warmed.value = true
})
</script>

<template>
  <main :data-warmed="warmed || undefined">
    <h1>Home</h1>
    <NuxtLink
      class="warm__shelf"
      to="/shelf"
    >
      Your shelf
    </NuxtLink>
  </main>
</template>
