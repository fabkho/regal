<script setup lang="ts">
// Rows at rest in cards too narrow for their Books (the synthetic Library has
// only five): the newest flush with the card's right edge, and a year row with
// its first Book flush with the left edge (tests/e2e/layer-host.test.ts).
useHead({ title: 'Rest — host' })
</script>

<template>
  <div class="rest">
    <RegalBooksRow
      class="rest__row rest__row--newest"
      label="Read lately"
    />
    <RegalBooksRow
      class="rest__row rest__row--year"
      :year="2024"
    />
  </div>
</template>

<style scoped>
.rest {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
}

.rest__row {
  height: 600px;
}

.rest__row--newest {
  width: 200px;
}

.rest__row--year {
  width: 72px;
}
</style>
