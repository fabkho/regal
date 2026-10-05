<script setup lang="ts">
// A host's profile page: the Library as one row in a card, a picked Book kept
// in the card; a second row breaks out to the viewport.
useHead({ title: 'Profile — host' })
</script>

<template>
  <div class="profile">
    <h1>Profile</h1>
    <section class="profile__card">
      <h2>Read</h2>
      <RegalBooksRow
        class="profile__row profile__row--card"
        label="Read lately"
      />
    </section>
    <section class="profile__card">
      <h2>2025</h2>
      <RegalBooksRow
        class="profile__row profile__row--out"
        inspect="viewport"
        :year="2025"
      />
    </section>
  </div>
</template>

<style scoped>
.profile__card {
  width: 360px;
  margin-bottom: 2rem;
}

.profile__row {
  height: 300px;
}
</style>
