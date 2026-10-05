<script setup lang="ts">
// A host page that passes #detail-header only sometimes (tests/nuxt/theming.test.ts):
// compiled templates, so Regal's markup and the host's must not be patched into each other.
defineProps<{ custom: boolean }>()
</script>

<template>
  <RegalBooksStage>
    <template
      v-if="custom"
      #detail-header="{ book }"
    >
      <h2 class="host-title">
        {{ book.title }}
      </h2>
    </template>
  </RegalBooksStage>
</template>
