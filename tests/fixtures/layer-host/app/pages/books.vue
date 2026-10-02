<script setup lang="ts">
// Layout A from the portfolio: the 3D Stack in the body, Regal's sidebar in
// the host's own 320 px sidebar.
useHead({ title: 'Books — host' })
</script>

<template>
  <div class="books">
    <main class="books__main">
      <h1>Books</h1>
      <RegalBooksStage class="books__stage" />
    </main>
    <aside class="books__sidebar">
      <RegalBooksSidebar
        heading="Reading"
        count-label="books read"
      />
    </aside>
  </div>
</template>

<style scoped>
.books {
  display: grid;
  grid-template-columns: 1fr 320px;
  height: 80vh;
}

.books__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.books__stage {
  flex: 1;
}

.books__sidebar {
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid;
}
</style>
