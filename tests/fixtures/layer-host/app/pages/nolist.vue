<script setup lang="ts">
// A host that renders its own list of Books: Regal's accessible list is off.
useHead({ title: 'Own list — host' })
</script>

<template>
  <div class="nolist">
    <h1>Own list</h1>
    <RegalBooksRow
      class="nolist__row"
      :accessible-list="false"
    />
    <RegalBooksStage
      class="nolist__stage"
      :accessible-list="false"
    />
  </div>
</template>

<style scoped>
.nolist__row {
  width: 360px;
  height: 300px;
  margin-bottom: 2rem;
}

.nolist__stage {
  height: 24rem;
}
</style>
