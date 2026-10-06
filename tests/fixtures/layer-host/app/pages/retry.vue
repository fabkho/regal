<script setup lang="ts">
// A host whose library request can fail (the test fails it once): the row and
// the ways to try again (tests/e2e/layer-host.test.ts). Client only, so the
// request is the browser's and the test can intercept it.
useHead({ title: 'Retry — host' })
</script>

<template>
  <main>
    <h1>Retry</h1>
    <ClientOnly>
      <RetryHost />
    </ClientOnly>
  </main>
</template>
