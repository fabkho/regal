<script setup lang="ts">
// Test hook (?debug=pick): exposes the Pick state and what is under the
// pointer as `window.__regalPick`, so a browser script can click real Books
// and real empty space and check the outcome (scripts/pick-fuzz.mjs).
// Renders nothing.
import { useLoop, useTres } from '@tresjs/core'
import { Vector3 } from 'three'
import type { Object3D } from 'three'
import { bookAt, toNdc } from '~/utils/books/hit'

const { scene, camera, renderer } = useTres()
const { onRender } = useLoop()
const { state } = useBookPick()

const books = () => scene.value.getObjectByName('books')
const canvas = () => renderer.domElement as HTMLCanvasElement
function bookMeshes() {
  const found: Object3D[] = []
  books()?.traverse((child) => {
    if (child.userData?.bookId) found.push(child)
  })
  return found
}

/** Last time a Book or the camera moved on screen, and frames drawn since. */
let lastMotion = performance.now()
let stillFrames = 0
let signature = ''
const centre = new Vector3()

onRender(() => {
  const parts: number[] = []
  for (const child of bookMeshes()) parts.push(...child.position.toArray(), ...child.quaternion.toArray())
  if (camera.value) parts.push(...camera.value.position.toArray())
  const next = parts.map(value => value.toFixed(4)).join(',')
  stillFrames++
  if (next !== signature) {
    signature = next
    lastMotion = performance.now()
    stillFrames = 0
  }
})

/** The canvas itself is under this point (no card, chip or label over it). */
function canvasAt(x: number, y: number) {
  return document.elementFromPoint(x, y) === canvas()
}

function hitAt(x: number, y: number) {
  const point = toNdc(canvas(), x, y)
  return point ? bookAt(books(), camera.value, point) : null
}

/** Screen points (client px) where a click lands on each visible Book. */
function clickableBooks() {
  const rect = canvas().getBoundingClientRect()
  const found: { id: string, x: number, y: number }[] = []
  for (const child of bookMeshes()) {
    const id = child.userData?.bookId as string | undefined
    if (!id || !camera.value) continue
    child.getWorldPosition(centre).project(camera.value)
    const x = rect.left + (centre.x + 1) / 2 * rect.width
    const y = rect.top + (1 - centre.y) / 2 * rect.height
    if (centre.z > 1 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
    if (canvasAt(x, y) && hitAt(x, y) === id) found.push({ id, x, y })
  }
  return found
}

/** Screen points (client px) on the canvas with no Book under them. */
function emptyPoints(step = 24) {
  const rect = canvas().getBoundingClientRect()
  const found: { x: number, y: number }[] = []
  for (let y = rect.top + step / 2; y < rect.bottom; y += step) {
    for (let x = rect.left + step / 2; x < rect.right; x += step) {
      if (canvasAt(x, y) && hitAt(x, y) === null) found.push({ x, y })
    }
  }
  return found
}

/** Every Pick state change, for tracing a failing sequence. */
const changes: { at: number, state: string }[] = []
watch(state, (value) => {
  changes.push({ at: Math.round(performance.now()), state: value.bookId ? `${value.bookId.slice(0, 8)}/${value.face}` : 'shelved' })
  if (changes.length > 50) changes.shift()
})

/** The scene's pointer state (@pmndrs/pointer-events, behind Tres's events), for diagnosis. */
function pointers() {
  const map = (globalThis as { pointerEventspointerMap?: Map<number, Record<string, unknown>> }).pointerEventspointerMap
  return [...(map?.values() ?? [])].map(pointer => ({
    type: pointer.type,
    enabled: pointer.enabled,
    wasMoved: pointer.wasMoved,
    queued: (pointer.onFirstMove as unknown[]).length,
    buttonsDown: [...(pointer.buttonsDown as Set<number>)],
    captured: (pointer.pointerCapture as { object?: Object3D } | undefined)?.object?.name ?? null,
    over: (pointer.intersection as { object?: Object3D } | undefined)?.object?.name ?? null,
  }))
}

/** What was under the last press and release of a pointer, as useBookClicks saw it. */
let lastPress: { x: number, y: number, hit: string | null } | null = null
let lastRelease: { x: number, y: number, onCanvas: boolean, hit: string | null } | null = null
function onPress(event: PointerEvent) {
  lastPress = { x: event.clientX, y: event.clientY, hit: hitAt(event.clientX, event.clientY) }
}
function onRelease(event: PointerEvent) {
  lastRelease = { x: event.clientX, y: event.clientY, onCanvas: event.target === canvas(), hit: hitAt(event.clientX, event.clientY) }
}

const api = {
  /** Every Book mesh in the scene (a Book should have exactly one). */
  meshes: () => bookMeshes().map(mesh => ({ id: mesh.userData.bookId as string, parent: mesh.parent?.name ?? null, visible: mesh.visible, position: mesh.position.toArray().map(value => Number(value.toFixed(3))) })),
  changes: () => changes.slice(),
  lastClick: () => ({ press: lastPress, release: lastRelease }),
  pointers,
  state: () => ({ ...state.value }),
  hitAt,
  canvasAt,
  clickableBooks,
  emptyPoints,
  /** Nothing has moved on screen for `ms` and a few frames (a slow machine draws few). */
  idle: (ms = 200) => performance.now() - lastMotion > ms && stillFrames >= 5,
}

const host = window as unknown as { __regalPick?: typeof api }
onMounted(() => {
  window.addEventListener('pointerdown', onPress)
  window.addEventListener('pointerup', onRelease)
  host.__regalPick = api
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPress)
  window.removeEventListener('pointerup', onRelease)
  delete host.__regalPick
})
</script>

<template>
  <TresGroup name="pick-probe" />
</template>
