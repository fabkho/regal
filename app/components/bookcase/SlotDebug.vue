<script setup lang="ts">
// Dev-only overlay: one translucent box per measured ShelfSlot, filling the
// usable volume Layout may place Books into. Toggle with ?debug=slots.
import { SHELF_SLOTS } from '~/utils/bookcase/shelves'
import { DEBUG_SLOT_FILL } from '~/utils/bookcase/scene'

const boxes = SHELF_SLOTS.map((slot) => {
  const width = slot.xEnd - slot.xStart
  const depth = slot.zFront - slot.zBack
  const height = slot.clearance * DEBUG_SLOT_FILL
  return {
    key: `${slot.shelf}-${slot.bay}`,
    args: [width, height, depth] as [number, number, number],
    position: [
      (slot.xStart + slot.xEnd) / 2,
      slot.y + height / 2,
      (slot.zBack + slot.zFront) / 2,
    ] as [number, number, number],
  }
})
</script>

<template>
  <TresGroup name="shelf-slot-debug">
    <TresMesh
      v-for="box in boxes"
      :key="box.key"
      :position="box.position"
    >
      <TresBoxGeometry :args="box.args" />
      <TresMeshBasicMaterial
        color="#B93E2E"
        :transparent="true"
        :opacity="0.18"
        :depth-write="false"
      />
    </TresMesh>
    <TresMesh
      v-for="box in boxes"
      :key="`wire-${box.key}`"
      :position="box.position"
    >
      <TresBoxGeometry :args="box.args" />
      <TresMeshBasicMaterial
        color="#B93E2E"
        :wireframe="true"
      />
    </TresMesh>
  </TresGroup>
</template>
