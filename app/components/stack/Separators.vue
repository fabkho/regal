<script setup lang="ts">
// Date separators in the Stack: one under each group of Books (a year, or a
// month inside one year), in one of three looks (dev choices). They don't take
// part in a re-sort: while the Books travel they fade out, and they fade back
// in at their new heights once the pile has settled.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import type { BufferGeometry, Material, Object3D } from 'three'
import { useLoop } from '@tresjs/core'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import type { StackSeparator } from '#layers/regal/app/utils/stack/layout'
import type { SeparatorStyle } from '#layers/regal/app/utils/stack/separators'
import { labelEm, MONO_ADVANCE, MONO_CAP, separatorRoom } from '#layers/regal/app/utils/stack/separators'

const props = defineProps<{
  separators: StackSeparator[]
  look: SeparatorStyle
  /** Height of the pile, for the room above the top separator. */
  stackHeight: number
}>()

const INK = '#2C2C2A'
const ACCENT = '#B93E2E'
const PAPER = '#F5F2EB'
const MUTED = '#6B6B69'
const FONT = '"IBM Plex Mono", ui-monospace, monospace'
/** The pile's footprint: Books lie with their height along x, their depth along z. */
const PILE_WIDTH = 0.27
const PILE_DEPTH = 0.17
/** A date beside the pile ends this far left of its centre (clear of the longest Books). */
const SIDE_EDGE = -0.165
const SIDE_MAX_WIDTH = 0.15
const FADE_RATE = 9

const reducedMotion = usePreferredReducedMotion()
const { onBeforeRender } = useLoop()
/** Meshes.vue records each re-sort and entrance; `until` is when its Books are back in the pile (performance.now()). */
const lastShuffle = useState<{ moves: number, style: string, until?: number } | null>('shuffle:last', () => null)

// --- Building blocks -------------------------------------------------------------

let font: Font | null = null
const fontReady = ref(false)
import('../../assets/fonts/ibm-plex-mono-semibold.typeface.json').then((module) => {
  font = new Font((module.default ?? module) as never)
  fontReady.value = true
})
const canvasFontReady = ref(false)
if (import.meta.client && document.fonts) {
  Promise.all([document.fonts.load(`600 64px ${FONT}`), document.fonts.load(`400 64px ${FONT}`)])
    .catch(() => undefined)
    .then(() => { canvasFontReady.value = true })
}
else {
  canvasFontReady.value = true
}

const noRaycast = () => {}

function mesh(geometry: BufferGeometry, material: Material | Material[], shadows = true): Mesh {
  const object = new Mesh(geometry, material)
  object.castShadow = shadows
  object.receiveShadow = true
  // Clicks go through to the Books.
  object.raycast = noRaycast
  return object
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const countText = (count: number) => `${count} ${count === 1 ? 'BOOK' : 'BOOKS'}`

interface Built {
  object: Group
  materials: Material[]
  dispose: () => void
}

/** Collects what a look creates so it can be faded and disposed together. */
function builder() {
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const textures: CanvasTexture[] = []
  return {
    geometries,
    materials,
    textures,
    material<T extends Material>(material: T): T {
      materials.push(material)
      return material
    },
    done(object: Group): Built {
      return {
        object,
        materials,
        dispose() {
          for (const geometry of geometries) geometry.dispose()
          for (const material of materials) material.dispose()
          for (const texture of textures) texture.dispose()
        },
      }
    },
  }
}

/** 'slab': a paper board in the pile, the date and count printed on its front edge (and pressed in: bump). */
function buildSlab(separator: StackSeparator): Built {
  const b = builder()
  const pxPerMetre = 7000
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(PILE_WIDTH * pxPerMetre)
  canvas.height = Math.round(separator.thickness * pxPerMetre)
  const context = canvas.getContext('2d')!
  context.fillStyle = PAPER
  context.fillRect(0, 0, canvas.width, canvas.height)
  const mid = canvas.height / 2
  const big = canvas.height * 0.62
  context.textBaseline = 'middle'
  context.fillStyle = INK
  context.font = `600 ${big}px ${FONT}`
  const pad = canvas.height * 0.9
  // An accent square marks the start, like a bullet in the paper-ink UI.
  context.fillStyle = ACCENT
  context.fillRect(pad, mid - big * 0.22, big * 0.44, big * 0.44)
  context.fillStyle = INK
  context.letterSpacing = `${big * 0.08}px`
  context.fillText(separator.label, pad + big * 0.9, mid + big * 0.04)
  const labelEnd = pad + big * 0.9 + context.measureText(separator.label).width
  context.font = `500 ${big * 0.72}px ${FONT}`
  context.fillStyle = MUTED
  const count = countText(separator.count)
  const countWidth = context.measureText(count).width
  context.textAlign = 'right'
  context.fillText(count, canvas.width - pad, mid + big * 0.04)
  // Hairline between date and count.
  context.fillStyle = 'rgba(44, 44, 42, 0.35)'
  context.fillRect(labelEnd + big * 0.6, mid - 1, canvas.width - pad - countWidth - big * 0.6 - (labelEnd + big * 0.6), 2)

  const front = canvasTexture(canvas)
  b.textures.push(front)
  const paper = b.material(new MeshStandardMaterial({ color: new Color(PAPER).multiplyScalar(0.82), roughness: 0.92 }))
  const face = b.material(new MeshStandardMaterial({ map: front, bumpMap: front, bumpScale: -0.6, color: new Color(1, 1, 1).multiplyScalar(0.82), roughness: 0.88 }))
  const geometry = new BoxGeometry(PILE_WIDTH, separator.thickness, PILE_DEPTH)
  b.geometries.push(geometry)
  const group = new Group()
  // BoxGeometry faces: +x, -x, +y, -y, +z (towards the viewer), -z.
  group.add(mesh(geometry, [paper, paper, paper, paper, face, paper]))
  return b.done(group)
}

/** 'MAR 2026' → the month big, the year small beside it; '2025' / 'UNDATED' as they are. */
function splitLabel(label: string): { main: string, small: string } {
  const month = /^([A-Z]{3}) (\d{4})$/.exec(label)
  return month ? { main: month[1]!, small: month[2]! } : { main: label, small: '' }
}
/** The year next to a month, relative to the month's size. */
const SMALL_SCALE = 0.42

function textGeometry(text: string, em: number): TextGeometry {
  const geometry = new TextGeometry(text, {
    font: font!,
    size: em,
    depth: Math.max(0.0025, em * 0.22),
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: em * 0.012,
    bevelSize: em * 0.01,
    bevelSegments: 2,
  })
  geometry.computeBoundingBox()
  return geometry
}

/** 'numerals': a thin paper card under the group, its front edge brick red, with a ledge beside the pile where extruded ink numerals stand. */
function buildNumerals(separator: StackSeparator, room: number): Built {
  const b = builder()
  const group = new Group()
  const paper = b.material(new MeshStandardMaterial({ color: new Color(PAPER).multiplyScalar(0.8), roughness: 0.9 }))
  const edge = b.material(new MeshStandardMaterial({ color: new Color(ACCENT).multiplyScalar(0.85), roughness: 0.7 }))
  // BoxGeometry faces: +x, -x, +y, -y, +z (towards the viewer), -z.
  const faces = [paper, paper, paper, paper, edge, paper]
  const front = PILE_DEPTH / 2 - 0.013
  const pileLeft = -PILE_WIDTH / 2 + 0.012
  const pileRight = PILE_WIDTH / 2 - 0.005
  const cardDepth = PILE_DEPTH - 0.05
  const ledgeDepth = 0.04
  const card = new BoxGeometry(pileRight - pileLeft, separator.thickness, cardDepth)
  b.geometries.push(card)
  const cardMesh = mesh(card, faces)
  cardMesh.position.set((pileLeft + pileRight) / 2, 0, front - cardDepth / 2)
  group.add(cardMesh)
  let ledgeLeft = SIDE_EDGE - 0.06

  if (font) {
    const { main, small } = splitLabel(separator.label)
    const chars = main.length + (small ? 0.5 + small.length * SMALL_SCALE : 0)
    const em = labelEm(main, { chars, maxCap: 0.03, maxWidth: SIDE_MAX_WIDTH, room, minCap: 0.007 })
    const ink = b.material(new MeshStandardMaterial({ color: INK, roughness: 0.55, metalness: 0 }))
    const z = front - ledgeDepth / 2
    let right = SIDE_EDGE
    if (small) {
      // The year, top-aligned with the month, ends at the pile.
      const year = textGeometry(small, em * SMALL_SCALE)
      const box = year.boundingBox!
      year.translate(-box.max.x, -box.max.y, -(box.max.z + box.min.z) / 2)
      b.geometries.push(year)
      const yearMesh = mesh(year, ink)
      yearMesh.position.set(right, separator.thickness / 2 + em * MONO_CAP, z)
      group.add(yearMesh)
      right += box.min.x - box.max.x - em * MONO_ADVANCE * 0.35
    }
    const text = textGeometry(main, em)
    const box = text.boundingBox!
    // Right edge at the pile (or the year), baseline on the ledge.
    text.translate(-box.max.x, -box.min.y, -(box.max.z + box.min.z) / 2)
    b.geometries.push(text)
    const numerals = mesh(text, ink)
    numerals.position.set(right, separator.thickness / 2, z)
    group.add(numerals)
    ledgeLeft = right + box.min.x - box.max.x - 0.012
  }
  // The ledge reaches just past the date.
  const ledge = new BoxGeometry(pileLeft - ledgeLeft, separator.thickness, ledgeDepth)
  b.geometries.push(ledge)
  const ledgeMesh = mesh(ledge, faces)
  ledgeMesh.position.set((ledgeLeft + pileLeft) / 2, 0, front - ledgeDepth / 2)
  group.add(ledgeMesh)
  return b.done(group)
}

/** 'label': a hairline ink sheet in the pile, a flat printed label with a leader line beside it. */
function buildLabel(separator: StackSeparator, room: number): Built {
  const b = builder()
  const group = new Group()
  // Narrower than the Books (so its top stays hidden), its front edge a hairline in front of the Spines.
  const sheetWidth = PILE_WIDTH - 0.08
  const sheetGeometry = new BoxGeometry(sheetWidth, separator.thickness, PILE_DEPTH)
  b.geometries.push(sheetGeometry)
  group.add(mesh(sheetGeometry, b.material(new MeshStandardMaterial({ color: INK, roughness: 0.8 }))))

  const { main, small } = splitLabel(separator.label)
  const chars = main.length + (small ? 0.5 + small.length * SMALL_SCALE : 0)
  const em = labelEm(main, { chars, maxCap: 0.018, maxWidth: SIDE_MAX_WIDTH * 0.8, room, minCap: 0.006 })
  const cap = em * MONO_CAP
  const width = 0.2
  const height = cap * 1.7
  const pxPerMetre = 9000
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pxPerMetre)
  canvas.height = Math.round(height * pxPerMetre)
  const context = canvas.getContext('2d')!
  const emPx = em * pxPerMetre
  const capPx = cap * pxPerMetre
  const baseline = canvas.height - capPx * 0.55
  context.textBaseline = 'alphabetic'
  context.fillStyle = INK
  context.font = `600 ${emPx}px ${FONT}`
  context.letterSpacing = `${emPx * 0.06}px`
  context.fillText(main, 0, baseline)
  let labelEnd = context.measureText(main).width
  if (small) {
    context.font = `600 ${emPx * SMALL_SCALE}px ${FONT}`
    context.textBaseline = 'top'
    // Top-aligned with the month's capitals.
    context.fillText(small, labelEnd + emPx * 0.2, baseline - capPx - emPx * 0.02)
    labelEnd += emPx * 0.2 + context.measureText(small).width
    context.textBaseline = 'alphabetic'
  }
  // The count in the accent colour, on the baseline after the date.
  context.font = `500 ${emPx * 0.36}px ${FONT}`
  context.letterSpacing = `${emPx * 0.05}px`
  context.fillStyle = ACCENT
  context.fillText(countText(separator.count), labelEnd + emPx * 0.45, baseline)
  // Leader line from the date to the pile, on the sheet's height.
  context.fillStyle = INK
  const lineY = canvas.height - Math.max(2, capPx * 0.08)
  context.fillRect(0, lineY, canvas.width, Math.max(2, capPx * 0.06))

  const texture = canvasTexture(canvas)
  b.textures.push(texture)
  const planeGeometry = new PlaneGeometry(width, height)
  b.geometries.push(planeGeometry)
  const material = b.material(new MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.02, roughness: 0.9, side: DoubleSide }))
  material.userData.alwaysTransparent = true
  const plane = mesh(planeGeometry, material, false)
  // The leader line runs on the sheet's height and its right end reaches into the pile.
  plane.position.set(-sheetWidth / 2 - width / 2, height / 2 - separator.thickness / 2, PILE_DEPTH / 2)
  group.add(plane)
  return b.done(group)
}

/** 'tab': a paper divider card in the pile; its tab stands upright beside the pile with the date printed on it. */
function buildTab(separator: StackSeparator, room: number): Built {
  const b = builder()
  const group = new Group()
  const paper = b.material(new MeshStandardMaterial({ color: new Color(PAPER).multiplyScalar(0.82), roughness: 0.9 }))
  const cardWidth = PILE_WIDTH - 0.04
  const card = new BoxGeometry(cardWidth, separator.thickness, PILE_DEPTH - 0.03)
  b.geometries.push(card)
  group.add(mesh(card, paper))

  const { main, small } = splitLabel(separator.label)
  const chars = main.length + (small ? 0.5 + small.length * SMALL_SCALE : 0)
  // The whole tab (date plus padding, 2.4 caps) has to fit under the next separator.
  const em = labelEm(main, { chars, maxCap: 0.016, maxWidth: SIDE_MAX_WIDTH * 0.75, room: room / 2.6 / 0.85, minCap: 0.004 })
  const cap = em * MONO_CAP
  const pad = cap * 0.7
  const textWidth = chars * MONO_ADVANCE * em
  /** The tab's right end tucks in behind the Books. */
  const tucked = 0.014
  const width = textWidth + pad * 2.4 + tucked
  const height = cap + pad * 2
  const pxPerMetre = 9000
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pxPerMetre)
  canvas.height = Math.round(height * pxPerMetre)
  const context = canvas.getContext('2d')!
  const emPx = em * pxPerMetre
  const capPx = cap * pxPerMetre
  const padPx = pad * pxPerMetre
  // Paper tab, rounded at the top like an index card's, an ink hairline round it.
  const radius = padPx * 0.9
  context.beginPath()
  context.roundRect(1, 1, canvas.width - 2, canvas.height + radius, radius)
  context.fillStyle = '#EFEAE0'
  context.fill()
  context.lineWidth = Math.max(2, capPx * 0.05)
  context.strokeStyle = INK
  context.stroke()
  // Red rule along the foot, where the tab meets the card.
  context.fillStyle = ACCENT
  context.fillRect(0, canvas.height - Math.max(3, capPx * 0.12), canvas.width, Math.max(3, capPx * 0.12))
  const baseline = padPx + capPx
  context.fillStyle = INK
  context.textBaseline = 'alphabetic'
  context.font = `600 ${emPx}px ${FONT}`
  context.letterSpacing = `${emPx * 0.04}px`
  context.fillText(main, padPx * 1.2, baseline)
  if (small) {
    const end = padPx * 1.2 + context.measureText(main).width
    context.font = `500 ${emPx * SMALL_SCALE}px ${FONT}`
    context.textBaseline = 'top'
    context.fillStyle = ACCENT
    context.fillText(small, end + emPx * 0.15, baseline - capPx - emPx * 0.02)
  }
  const texture = canvasTexture(canvas)
  b.textures.push(texture)
  const plane = new PlaneGeometry(width, height)
  b.geometries.push(plane)
  const material = b.material(new MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.5, roughness: 0.9, side: DoubleSide }))
  material.userData.alwaysTransparent = true
  const tab = mesh(plane, material, false)
  // Stands on the card's left end, a little behind the Spines, leaning back slightly.
  tab.position.set(-PILE_WIDTH / 2 + 0.017 - width / 2, height / 2 + separator.thickness / 2, PILE_DEPTH / 2 - 0.035)
  tab.rotation.x = -0.06
  // A short ledge under the tab so it doesn't float.
  const ledge = new BoxGeometry(width, separator.thickness, 0.03)
  b.geometries.push(ledge)
  const ledgeMesh = mesh(ledge, paper)
  ledgeMesh.position.set(tab.position.x, 0, PILE_DEPTH / 2 - 0.035)
  group.add(tab, ledgeMesh)
  return b.done(group)
}

/** 'volume': an ink-black volume lying in the pile, its Spine printed with the date (paper) and count (red). */
function buildVolume(separator: StackSeparator): Built {
  const b = builder()
  const width = PILE_WIDTH - 0.035
  const depth = PILE_DEPTH - 0.025
  const pxPerMetre = 7000
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pxPerMetre)
  canvas.height = Math.round(separator.thickness * pxPerMetre)
  const context = canvas.getContext('2d')!
  context.fillStyle = INK
  context.fillRect(0, 0, canvas.width, canvas.height)
  // Two thin paper bands near the ends, like a cloth binding's.
  context.fillStyle = 'rgba(245, 242, 235, 0.55)'
  const band = Math.max(2, canvas.height * 0.04)
  for (const x of [canvas.height * 0.5, canvas.width - canvas.height * 0.5 - band]) context.fillRect(x, canvas.height * 0.18, band, canvas.height * 0.64)
  const mid = canvas.height / 2
  const big = canvas.height * 0.5
  context.textBaseline = 'middle'
  context.textAlign = 'center'
  context.font = `600 ${big}px ${FONT}`
  context.letterSpacing = `${big * 0.14}px`
  context.fillStyle = PAPER
  const count = countText(separator.count)
  context.fillText(separator.label, canvas.width * 0.42, mid + big * 0.05)
  context.font = `500 ${big * 0.55}px ${FONT}`
  context.letterSpacing = `${big * 0.08}px`
  context.fillStyle = '#D9644F'
  context.fillText(count, canvas.width * 0.8, mid + big * 0.05)
  const spine = canvasTexture(canvas)
  b.textures.push(spine)
  const cloth = b.material(new MeshStandardMaterial({ color: new Color(INK).multiplyScalar(0.9), roughness: 0.7 }))
  const face = b.material(new MeshStandardMaterial({ map: spine, roughness: 0.6 }))
  const geometry = new BoxGeometry(width, separator.thickness, depth)
  b.geometries.push(geometry)
  const group = new Group()
  const volume = mesh(geometry, [cloth, cloth, cloth, cloth, face, cloth])
  volume.position.z = (PILE_DEPTH - depth) / 2 - 0.004
  group.add(volume)
  return b.done(group)
}

function build(separator: StackSeparator, room: number): Built {
  if (props.look === 'slab') return buildSlab(separator)
  if (props.look === 'tab') return buildTab(separator, room)
  if (props.look === 'volume') return buildVolume(separator)
  if (props.look === 'label') return buildLabel(separator, room)
  return buildNumerals(separator, room)
}

// --- Shown separators: fade out, move while invisible, fade back in -----------------

interface Shown {
  /** Separator key + everything that changes how it is built. */
  id: string
  separator: StackSeparator
  built: Built
  y: number
  opacity: number
  alive: boolean
  /** A new separator stays hidden until then (performance.now()), see NEW_HOLD_MS. */
  holdUntil: number
}

/**
 * A separator made by a filter or sort change waits this long before fading
 * in: the re-sort that change starts is recorded (lastShuffle) a frame later,
 * and without the wait the separator would flash in for that frame.
 */
const NEW_HOLD_MS = 150

const shown = shallowRef<Shown[]>([])
const sizeBucket = (room: number) => Math.round(Math.min(room, 0.05) * 1000)

function sync() {
  if (import.meta.server || !canvasFontReady.value) return
  const rooms = separatorRoom(props.separators, props.stackHeight)
  const byId = new Map(shown.value.map(item => [item.id, item]))
  const next: Shown[] = []
  const used = new Set<string>()
  for (const separator of props.separators) {
    const room = rooms.get(separator.key) ?? 0
    const sized = props.look !== 'slab' && props.look !== 'volume'
    const id = [props.look, separator.key, separator.label, separator.count, separator.thickness, sized ? sizeBucket(room) : '', fontReady.value].join('|')
    const current = byId.get(id)
    used.add(id)
    if (current) {
      current.separator = separator
      current.alive = true
      next.push(current)
    }
    else {
      next.push({ id, separator, built: build(separator, room), y: separator.y, opacity: 0, alive: true, holdUntil: performance.now() + NEW_HOLD_MS })
    }
  }
  // Separators that went away (or changed look) fade out first.
  for (const item of shown.value) {
    if (used.has(item.id)) continue
    item.alive = false
    next.push(item)
  }
  shown.value = next
}

watch([() => props.separators, () => props.look, () => props.stackHeight, fontReady, canvasFontReady], sync, { immediate: true })

function setOpacity(item: Shown, opacity: number) {
  const opaque = opacity >= 0.995
  for (const material of item.built.materials) {
    const transparent = !opaque || material.userData.alwaysTransparent === true
    if (material.transparent !== transparent) {
      material.transparent = transparent
      material.needsUpdate = true
    }
    material.opacity = opacity
  }
  item.built.object.visible = opacity > 0.005
  item.built.object.traverse((child: Object3D) => {
    if ((child as Mesh).isMesh && child.userData.shadow !== false) child.castShadow = opaque
  })
}

onBeforeRender(({ delta }) => {
  const now = performance.now()
  // A little grace after a re-sort, in case another one follows straight away.
  const travelling = now < (lastShuffle.value?.until ?? 0) + 120
  const instant = reducedMotion.value === 'reduce'
  const ease = instant ? 1 : 1 - Math.exp(-(delta ?? 0.016) * FADE_RATE)
  let removed = false
  for (const item of shown.value) {
    const moving = Math.abs(item.y - item.separator.y) > 1e-5
    const target = item.alive && !travelling && !moving && now >= item.holdUntil ? 1 : 0
    item.opacity += (target - item.opacity) * ease
    if (Math.abs(item.opacity - target) < 0.004) item.opacity = target
    // Hidden: now it can jump to its new height.
    if (moving && item.opacity === 0) item.y = item.separator.y
    if (!item.alive && item.opacity === 0) removed = true
    item.built.object.position.y = item.y
    setOpacity(item, item.opacity)
  }
  if (removed) {
    const keep: Shown[] = []
    for (const item of shown.value) {
      if (!item.alive && item.opacity === 0) item.built.dispose()
      else keep.push(item)
    }
    shown.value = keep
  }
})

onBeforeUnmount(() => {
  for (const item of shown.value) item.built.dispose()
})
</script>

<template>
  <TresGroup name="stack-separators">
    <primitive
      v-for="item in shown"
      :key="item.id"
      :object="item.built.object"
    />
  </TresGroup>
</template>
