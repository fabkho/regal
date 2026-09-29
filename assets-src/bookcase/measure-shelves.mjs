// Measures the Shelf surfaces of public/models/bookcase.glb and writes the
// typed result to app/utils/bookcase/shelves.ts (input for Layout, #4).
//
//   node assets-src/bookcase/measure-shelves.mjs [--check]
//
// No dependencies: the GLB is parsed by hand (one mesh, one primitive) so this
// stays runnable years from now. Method: collect every triangle in world space,
// then
//   1. up-facing triangles (normal.y ≈ +1), area-weighted histogram of y
//      → the Shelf boards. The big levels inside the bay region are Shelf tops.
//   2. vertical triangles (normal.x ≈ ±1) spanning a Shelf → the dividers,
//      which bound each bay in x.
//   3. the back panel plane (normal.z ≈ +1, smallest z) → zBack.
//   4. down-facing triangles (normal.y ≈ -1) above a Shelf, overlapping its
//      usable x/z window → clearance to the underside of the board above.
// Model units are arbitrary; everything is scaled so the Bookcase is
// TARGET_HEIGHT_M tall, which makes world units metres.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../../', import.meta.url)
const MODEL = new URL('public/models/bookcase.glb', ROOT)
const OUT = new URL('app/utils/bookcase/shelves.ts', ROOT)

/** Real-world height of the Bookcase, in metres. */
const TARGET_HEIGHT_M = 2.4
/** A triangle counts as flat/vertical when its normal is this aligned. */
const ALIGNED = 0.98
/** Two coplanar levels closer than this (model units) are the same surface. */
const LEVEL_EPS = 0.01
/** A Shelf board must be at least this deep (model units) — skips mouldings. */
const MIN_BOARD_DEPTH = 0.15
/** …and must cover at least this fraction of its bay's width. */
const MIN_BAY_COVERAGE = 0.8

// ---------------------------------------------------------------- glb reader

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

async function readGlb(url) {
  const buf = await readFile(url)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb')
  let offset = 12
  let json = null
  let bin = null
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset)
    const type = buf.readUInt32LE(offset + 4)
    const chunk = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk))
    if (type === 0x004e4942) bin = chunk
    offset += 8 + length
    offset += (4 - (offset % 4)) % 4
  }
  return { json, bin }
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index]
  const size = COMPONENTS_PER[accessor.type]
  const Type = COMPONENT[accessor.componentType]
  const out = new Float64Array(accessor.count * size)
  if (accessor.bufferView === undefined) return out
  const view = json.bufferViews[accessor.bufferView]
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const elementSize = Type.BYTES_PER_ELEMENT * size
  const stride = view.byteStride ?? elementSize
  for (let i = 0; i < accessor.count; i++) {
    const from = bin.byteOffset + base + i * stride
    const element = new Type(bin.buffer.slice(from, from + elementSize))
    for (let c = 0; c < size; c++) out[i * size + c] = element[c]
  }
  return out
}

/** Column-major 4×4 multiply. */
function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

function localMatrix(node) {
  if (node.matrix) return node.matrix.slice()
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transform(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

/** Every triangle of the default scene, in the glTF scene's own space. */
function sceneTriangles({ json, bin }) {
  const triangles = []
  const walk = (index, parent) => {
    const node = json.nodes[index]
    const world = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) continue
        const position = readAccessor(json, bin, primitive.attributes.POSITION)
        const indices = primitive.indices !== undefined
          ? readAccessor(json, bin, primitive.indices)
          : Float64Array.from({ length: position.length / 3 }, (_, i) => i)
        for (let i = 0; i < indices.length; i += 3) {
          triangles.push([0, 1, 2].map((k) => {
            const v = indices[i + k] * 3
            return transform(world, [position[v], position[v + 1], position[v + 2]])
          }))
        }
      }
    }
    for (const child of node.children ?? []) walk(child, world)
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  for (const node of json.scenes[json.scene ?? 0].nodes) walk(node, identity)
  return triangles
}

// -------------------------------------------------------------- measure step

const centroid = (t, axis) => (t[0][axis] + t[1][axis] + t[2][axis]) / 3
const lo = (t, axis) => Math.min(t[0][axis], t[1][axis], t[2][axis])
const hi = (t, axis) => Math.max(t[0][axis], t[1][axis], t[2][axis])

function normal([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const length = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / length, n[1] / length, n[2] / length]
}

function area([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return Math.hypot(
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ) / 2
}

const overlaps = (aMin, aMax, bMin, bMax) => aMin < bMax - 1e-4 && bMin < aMax - 1e-4

/** Group coplanar triangles into levels: [{ value, area, triangles }]. */
function levels(triangles, axis) {
  const groups = []
  for (const triangle of triangles) {
    const value = centroid(triangle, axis)
    const group = groups.find(g => Math.abs(g.value - value) < LEVEL_EPS)
    if (group) {
      group.triangles.push(triangle)
      group.area += area(triangle)
      group.value = (group.value * (group.triangles.length - 1) + value) / group.triangles.length
    }
    else {
      groups.push({ value, area: area(triangle), triangles: [triangle] })
    }
  }
  return groups.sort((a, b) => a.value - b.value)
}

/** Merge 1-D intervals that touch or overlap. */
function spans(triangles, axis, gap = 0.02) {
  const intervals = triangles
    .map(t => [lo(t, axis), hi(t, axis)])
    .sort((a, b) => a[0] - b[0])
  const out = []
  for (const [from, to] of intervals) {
    const last = out[out.length - 1]
    if (last && from <= last[1] + gap) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}

function measure(triangles) {
  const up = triangles.filter(t => normal(t)[1] > ALIGNED)
  const down = triangles.filter(t => normal(t)[1] < -ALIGNED)
  const sideways = triangles.filter(t => Math.abs(normal(t)[0]) > ALIGNED)
  const forward = triangles.filter(t => normal(t)[2] > ALIGNED)

  const modelBounds = [0, 1, 2].map(axis => [
    Math.min(...triangles.map(t => lo(t, axis))),
    Math.max(...triangles.map(t => hi(t, axis))),
  ])
  const modelHeight = modelBounds[1][1] - modelBounds[1][0]
  const scale = TARGET_HEIGHT_M / modelHeight

  // The back panel: the front-facing plane furthest back that is tall enough to
  // be a panel rather than a moulding.
  const backPanel = levels(forward, 2).find(l => l.triangles.some(t => hi(t, 1) - lo(t, 1) > modelHeight * 0.5))
  const zBack = backPanel.value

  // Dividers: pairs of inward-facing vertical planes that run the full height
  // of the bay region. Their x positions bound the bays.
  const isPanel = t => hi(t, 1) - lo(t, 1) > modelHeight * 0.5
  const walls = levels(sideways, 0)
    .filter(l => l.triangles.some(isPanel))
    .map(l => ({
      x: l.value,
      inward: normal(l.triangles[0])[0],
      // Only the tall panel faces describe the bay opening; the short faces at
      // the same x are base and cornice mouldings that sit proud of it.
      front: Math.max(...l.triangles.filter(isPanel).map(t => hi(t, 2))),
    }))
  const bays = []
  for (let i = 0; i < walls.length - 1; i++) {
    const left = walls[i]
    const right = walls[i + 1]
    // A bay is bounded by a wall facing right (+x) on the left and one facing
    // left (−x) on the right.
    if (left.inward > 0 && right.inward < 0) {
      bays.push({ xStart: left.x, xEnd: right.x, zOpening: Math.min(left.front, right.front) })
    }
  }
  if (bays.length === 0) throw new Error('no bays found')

  // Shelf surfaces: up-facing levels that span every bay.
  const insideBays = t => bays.some(b => overlaps(lo(t, 0), hi(t, 0), b.xStart, b.xEnd)) && lo(t, 2) < bays[0].zOpening
  const boardIn = (level, bay) => level.triangles.filter(t => overlaps(lo(t, 0), hi(t, 0), bay.xStart, bay.xEnd))
  // A Shelf surface is a board that is deep enough to stand a Book on and wide
  // enough to cross its whole bay — in every bay. That rejects the cornice
  // recess, the cabinet-top lip and the base mouldings, which are also flat and
  // up-facing but only centimetres deep.
  const isShelfBoard = (level, bay) => {
    const board = boardIn(level, bay)
    if (board.length === 0) return false
    const depth = Math.max(...board.map(t => hi(t, 2))) - Math.min(...board.map(t => lo(t, 2)))
    const covered = spans(board, 0).reduce((sum, [from, to]) => sum + Math.min(to, bay.xEnd) - Math.max(from, bay.xStart), 0)
    return depth >= MIN_BOARD_DEPTH && covered >= (bay.xEnd - bay.xStart) * MIN_BAY_COVERAGE
  }
  const shelves = levels(up.filter(insideBays), 1)
    .filter(level => bays.every(bay => isShelfBoard(level, bay)))
    .filter(level => level.value < modelBounds[1][1] - 0.1) // not the crown top
    .reverse() // top → bottom

  const slots = []
  for (const [shelfIndex, level] of shelves.entries()) {
    for (const [bayIndex, bay] of bays.entries()) {
      const board = boardIn(level, bay)
      const zFront = Math.min(Math.max(...board.map(t => hi(t, 2))), bay.zOpening)
      // Underside of the board above, anywhere over the usable footprint.
      const ceiling = Math.min(...down
        .filter(t => centroid(t, 1) > level.value + LEVEL_EPS)
        .filter(t => overlaps(lo(t, 0), hi(t, 0), bay.xStart, bay.xEnd) && overlaps(lo(t, 2), hi(t, 2), zBack, zFront))
        .map(t => centroid(t, 1)))
      slots.push({
        bay: bayIndex,
        shelf: shelfIndex,
        y: level.value,
        xStart: bay.xStart,
        xEnd: bay.xEnd,
        zFront,
        zBack,
        clearance: ceiling - level.value,
      })
    }
  }

  return { modelBounds, modelHeight, scale, bays, slots, spans: spans(up, 0) }
}

// ------------------------------------------------------------------ emit step

const round = (value, digits = 4) => Number(value.toFixed(digits))

function toSource({ modelBounds, scale, slots }) {
  const s = (value, digits = 4) => round(value * scale, digits)
  const size = {
    width: s(modelBounds[0][1] - modelBounds[0][0]),
    height: s(modelBounds[1][1] - modelBounds[1][0]),
    depth: s(modelBounds[2][1] - modelBounds[2][0]),
  }
  const rows = slots.map(slot => `  { bay: ${slot.bay}, shelf: ${slot.shelf}, y: ${s(slot.y)}, xStart: ${s(slot.xStart)}, xEnd: ${s(slot.xEnd)}, zFront: ${s(slot.zFront)}, zBack: ${s(slot.zBack)}, clearance: ${s(slot.clearance)} },`)
  const shelfCount = new Set(slots.map(slot => slot.shelf)).size
  const bayCount = new Set(slots.map(slot => slot.bay)).size

  return `// Generated by assets-src/bookcase/measure-shelves.mjs — do not edit by hand.
// Measured from public/models/bookcase.glb, in world metres after BOOKCASE_SCALE.
//
// Origin: the Bookcase is centred on x = 0, stands on y = 0 and has the back of
// its case at z = 0, so the front edge is at z = BOOKCASE_SIZE.depth. +z is the
// side the camera looks from. World space equals model space × BOOKCASE_SCALE.

/** One usable Shelf surface: the board of one bay on one Shelf. */
export interface ShelfSlot {
  /** 0 = leftmost bay as seen from the front. */
  bay: number
  /** 0 = topmost Shelf. */
  shelf: number
  /** Height of the Shelf surface a Book stands on. */
  y: number
  /** Left edge of the usable surface (inside the divider). */
  xStart: number
  /** Right edge of the usable surface (inside the divider). */
  xEnd: number
  /** Front edge of the usable surface. */
  zFront: number
  /** Back edge of the usable surface (the back panel). */
  zBack: number
  /** Vertical room to the underside of the board above — the Book height cap. */
  clearance: number
}

/** Model units × this = world metres. */
export const BOOKCASE_SCALE = ${round(scale, 6)}

/** Outer size of the Bookcase in world metres. */
export const BOOKCASE_SIZE = { width: ${size.width}, height: ${size.height}, depth: ${size.depth} }

/** Bays per Bookcase, left to right. */
export const BAY_COUNT = ${bayCount}

/** Shelves per bay, top to bottom. */
export const SHELF_COUNT = ${shelfCount}

/** All ${slots.length} Shelf surfaces in reading order: top to bottom, left to right. */
export const SHELF_SLOTS: ShelfSlot[] = [
${rows.join('\n')}
]

/** The tallest Book any Shelf can take, in world metres. */
export const MAX_BOOK_HEIGHT = ${round(Math.min(...slots.map(s2 => s2.clearance)) * scale, 4)}

/** Usable depth of a Shelf, in world metres. */
export const SHELF_DEPTH = ${round(Math.min(...slots.map(s2 => s2.zFront - s2.zBack)) * scale, 4)}
`
}

// ----------------------------------------------------------------------- main

const glb = await readGlb(MODEL)
const triangles = sceneTriangles(glb)
const result = measure(triangles)
const source = toSource(result)

const { scale, slots, bays, modelBounds } = result
console.log(`model bounds  x ${modelBounds[0].map(v => v.toFixed(3)).join(' … ')}  y ${modelBounds[1].map(v => v.toFixed(3)).join(' … ')}  z ${modelBounds[2].map(v => v.toFixed(3)).join(' … ')}`)
console.log(`triangles ${triangles.length}  scale ${scale.toFixed(6)} → ${TARGET_HEIGHT_M} m tall\n`)
console.log(`bays (model units): ${bays.map(b => `${b.xStart.toFixed(3)}…${b.xEnd.toFixed(3)}`).join('  ')}`)
console.log('\nshelf  y (model)   y (m)    clearance (m)  width (m)  depth (m)')
for (const slot of slots.filter(s2 => s2.bay === 0)) {
  console.log(
    `  ${slot.shelf}    ${slot.y.toFixed(5)}   ${(slot.y * scale).toFixed(4)}   ${(slot.clearance * scale).toFixed(4)}         ${((slot.xEnd - slot.xStart) * scale).toFixed(4)}     ${((slot.zFront - slot.zBack) * scale).toFixed(4)}`,
  )
}

if (process.argv.includes('--check')) {
  const current = await readFile(OUT, 'utf8').catch(() => '')
  if (current !== source) {
    console.error(`\n${fileURLToPath(OUT)} is out of date — rerun without --check`)
    process.exit(1)
  }
  console.log('\nshelves.ts is up to date')
}
else {
  await writeFile(OUT, source)
  console.log(`\nwrote ${fileURLToPath(OUT)} (${slots.length} slots)`)
}
