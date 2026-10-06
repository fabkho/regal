<script setup lang="ts">
// A host's own Try again (the Profile's): the row mounted again, the built-in
// button, and the host's own through `useRegalLibrary().retry()`. Client only
// (RetryPage's ClientOnly), so the browser makes the library request the
// test fails once.
const { retry, error } = useRegalLibrary()
const mounts = ref(1)
const shown = ref(true)
</script>

<template>
  <div class="retry">
    <p
      class="retry__state"
      :data-error="error ? 'yes' : 'no'"
    >
      {{ error ? 'failed' : 'fine' }}
    </p>
    <RegalBooksRow
      v-if="shown"
      :key="mounts"
      class="retry__row"
      label="Retried"
    />
    <button
      class="retry__remount"
      type="button"
      @click="mounts++"
    >
      Remount the row
    </button>
    <button
      class="retry__host"
      type="button"
      @click="retry()"
    >
      Host's Try again
    </button>
  </div>
</template>

<style scoped>
.retry__row {
  height: 300px;
  width: 360px;
}
</style>
