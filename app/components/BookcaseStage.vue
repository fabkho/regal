<script setup lang="ts">
// Placeholder — the 3D Bookcase scene is built in #2.
</script>

<template>
  <section
    class="stage"
    aria-label="Bookcase"
  >
    <p class="stage__placeholder">
      Bookcase scene — coming in #2
    </p>
  </section>
</template>

<style scoped>
.stage {
  position: relative;
  display: grid;
  place-items: center;
}

.stage__placeholder {
  color: var(--color-ink-faint);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
