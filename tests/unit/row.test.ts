import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { layoutRow, ROW_CAMERA, ROW_FOCUS_GAP, ROW_LABEL_INSET, ROW_SHEET, rowBooks, rowFocusLabelTop, rowLabelNudge, rowLabels, rowProject, rowRest, rowScroll } from '../../app/utils/row/layout'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const library = [
  book('m1', { dateRead: '2026-03-20' }),
  book('m2', { dateRead: '2026-03-02' }),
  book('f1', { dateRead: '2026-02-10' }),
  book('d1', { dateRead: '2025-12-24' }),
  book('now', { status: 'currently-reading' }),
  book('later', { status: 'to-read' }),
  book('undated', { dateRead: null }),
]

/** RowScene's camera at rest, looking at the row at x. */
function sceneCamera(x: number, width: number, height: number) {
  const camera = new PerspectiveCamera(ROW_CAMERA.fov, width / height, 0.03, 20)
  const tilt = MathUtils.degToRad(ROW_CAMERA.tilt)
  const distance = ROW_CAMERA.viewHeight / (2 * Math.tan(MathUtils.degToRad(ROW_CAMERA.fov) / 2))
  camera.position.set(x, ROW_CAMERA.targetY + distance * Math.sin(tilt), ROW_CAMERA.targetZ + distance * Math.cos(tilt))
  camera.lookAt(x, ROW_CAMERA.targetY, ROW_CAMERA.targetZ)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

describe('rowBooks', () => {
  it('shows what is being read and what was read, newest first', () => {
    expect(rowBooks(library).map(item => item.id)).toEqual(['now', 'm1', 'm2', 'f1', 'd1'])
  })

  it('cuts to the newest `limit`', () => {
    expect(rowBooks(library, { limit: 2 }).map(item => item.id)).toEqual(['now', 'm1'])
  })

  it('keeps one year\'s reads only', () => {
    expect(rowBooks(library, { year: 2026 }).map(item => item.id)).toEqual(['m1', 'm2', 'f1'])
  })
})

describe('layoutRow', () => {
  const oldestFirst = rowBooks(library).reverse()
  const { poses, markers, extent } = layoutRow(oldestFirst)

  it('stands the Books left to right, oldest first, on one line', () => {
    expect(poses.map(pose => pose.bookId)).toEqual(['d1', 'f1', 'm2', 'm1', 'now'])
    expect(poses.every(pose => Math.abs(pose.y - pose.height / 2) < 1e-9)).toBe(true)
    expect(extent[0]).toBeLessThan(poses[0]!.x)
    expect(extent[1]).toBeGreaterThan(poses.at(-1)!.x)
  })

  it('presses the Books together, a hairline sheet before each month', () => {
    expect(markers.map(marker => marker.label)).toEqual(['DEC 2025', 'FEB 2026', 'MAR 2026', 'READING'])
    const left = (index: number) => poses[index]!.x - poses[index]!.thickness / 2
    const right = (index: number) => poses[index]!.x + poses[index]!.thickness / 2
    // m2 and m1 share March: no gap.
    expect(left(3)).toBeCloseTo(right(2))
    // A new month: one sheet between.
    expect(left(1) - right(0)).toBeCloseTo(ROW_SHEET)
    expect(markers.every(marker => marker.height >= 0.15)).toBe(true)
  })

  it('is deterministic', () => {
    expect(layoutRow(oldestFirst)).toEqual(layoutRow(oldestFirst))
  })
})

describe('rowLabels', () => {
  const markers = [
    { key: 'a', label: 'JAN 2026', count: 1, x: 0, height: 0.2 },
    { key: 'b', label: 'FEB 2026', count: 2, x: 0.01, height: 0.2 },
    { key: 'c', label: 'MAR 2025', count: 3, x: 0.5, height: 0.2 },
  ]

  it('sets the month with its year small, and leaves out a date that would run into the one before', () => {
    expect(rowLabels(markers, 800).map(label => [label.key, label.text, label.small])).toEqual([['a', 'JAN', '2026'], ['c', 'MAR', '2025']])
  })

  it('drops the year when the whole row is one year', () => {
    expect(rowLabels(markers.slice(0, 1), 800)[0]!.small).toBe('')
  })
})

describe('rowScroll', () => {
  const { poses } = layoutRow(rowBooks(library).reverse())
  const pxPerMetre = 300 / ROW_CAMERA.viewHeight
  const width = 360
  const { cameraStart, maxScroll, trackWidth } = rowScroll({ poses }, width, pxPerMetre)
  /** The camera's x (the card's middle) at a scrollLeft, as RowCard maps it. */
  const cameraAt = (left: number) => cameraStart + left / pxPerMetre

  it('puts the first Book in the card\'s middle at the start and the last one at the end', () => {
    expect(cameraAt(0)).toBeCloseTo(poses[0]!.x, 9)
    expect(Math.abs(cameraAt(maxScroll) - poses.at(-1)!.x) * pxPerMetre).toBeLessThan(1)
    expect(trackWidth - width).toBe(maxScroll)
  })

  it('leaves half the card less half an end Spine before the first Book and after the last', () => {
    // Where the row's content starts and ends on the track, px.
    const leftOfFirst = (poses[0]!.x - poses[0]!.thickness / 2 - cameraStart) * pxPerMetre + width / 2
    const rightOfLast = trackWidth - ((poses.at(-1)!.x + poses.at(-1)!.thickness / 2 - cameraStart) * pxPerMetre + width / 2)
    expect(leftOfFirst).toBeCloseTo(width / 2 - poses[0]!.thickness / 2 * pxPerMetre, 6)
    expect(Math.abs(rightOfLast - (width / 2 - poses.at(-1)!.thickness / 2 * pxPerMetre))).toBeLessThan(1)
  })

  it('scrolls even a short row (every Book can be centred), and not a single Book', () => {
    expect(maxScroll).toBeGreaterThan(0)
    expect(maxScroll).toBeLessThan(width)
    const one = rowScroll({ poses: poses.slice(0, 1) }, width, pxPerMetre)
    expect(one).toEqual({ cameraStart: poses[0]!.x, maxScroll: 0, trackWidth: width })
    expect(rowScroll({ poses: [] }, width, pxPerMetre).maxScroll).toBe(0)
  })
})

describe('rowFocusLabelTop', () => {
  it('sits just under the row\'s front bottom edge in the card\'s middle, as the camera sees it', () => {
    for (const [width, height] of [[360, 300], [412, 300], [960, 320]] as const) {
      const point = new Vector3(0.4, 0, 0).project(sceneCamera(0.4, width, height))
      expect(rowFocusLabelTop(height)).toBeCloseTo((1 - point.y) / 2 * height + ROW_FOCUS_GAP, 6)
    }
  })

  it('is the same whichever Book is in focus and however wide the card', () => {
    const top = rowFocusLabelTop(300)
    expect(rowFocusLabelTop(300)).toBe(top)
    // Under the Spines, above the card's bottom edge.
    expect(top).toBeGreaterThan(0.75 * 300)
    expect(top).toBeLessThan(0.9 * 300)
  })
})

describe('rowRest (at rest the card is full of Books)', () => {
  /** A long row: 60 Books over 2025, newest first as rowBooks gives them. */
  const long = rowBooks(Array.from({ length: 60 }, (_, i) => book(`b${i}`, {
    dateRead: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    pages: 120 + (i * 37) % 600,
  })))
  const { poses } = layoutRow([...long].reverse())
  const pxPerMetre = 300 / ROW_CAMERA.viewHeight
  const width = 360
  const scroll = rowScroll({ poses }, width, pxPerMetre)
  /** Px from the card's left edge where world x shows at a scrollLeft (RowCard's mapping: the camera's x is the card's middle). */
  const onCard = (x: number, left: number) => (x - scroll.cameraStart - left / pxPerMetre) * pxPerMetre + width / 2
  const first = poses[0]!
  const last = poses.at(-1)!

  it('starting at the newest, puts the last Book\'s Spine flush with the card\'s right edge', () => {
    const left = rowRest({ poses }, scroll, width, pxPerMetre, 'newest')
    expect(onCard(last.x + last.thickness / 2, left)).toBeCloseTo(width, 6)
    // Not the end of the scroll: the end space (to centre the last Book) stays out of sight, the thumb not at the end.
    expect(left).toBeLessThan(scroll.maxScroll)
    expect(scroll.maxScroll - left).toBeCloseTo(width / 2 - last.thickness / 2 * pxPerMetre, 0)
  })

  it('starting at the oldest (a year row at January), puts the first Book\'s Spine flush with the left edge', () => {
    const left = rowRest({ poses }, scroll, width, pxPerMetre, 'oldest')
    expect(onCard(first.x - first.thickness / 2, left)).toBeCloseTo(0, 6)
    expect(left).toBeGreaterThan(0)
    expect(left).toBeCloseTo(width / 2 - first.thickness / 2 * pxPerMetre, 6)
  })

  it('has the Book then in the card\'s middle in focus (the focus line is the camera\'s x)', () => {
    for (const start of ['newest', 'oldest'] as const) {
      const left = rowRest({ poses }, scroll, width, pxPerMetre, start)
      const cameraX = scroll.cameraStart + left / pxPerMetre
      const inFocus = poses.find(pose => Math.abs(pose.x - cameraX) <= pose.thickness / 2 + 1e-9)
      expect(inFocus, start).toBeTruthy()
      // Neither end Book: the card is full on both sides of it.
      expect(inFocus).not.toBe(start === 'newest' ? last : first)
    }
  })

  it('scrolling on still centres either end Book (the rest lies inside the scroll)', () => {
    for (const start of ['newest', 'oldest'] as const) {
      const left = rowRest({ poses }, scroll, width, pxPerMetre, start)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left).toBeLessThanOrEqual(scroll.maxScroll)
    }
    expect(onCard(first.x, 0)).toBeCloseTo(width / 2, 6)
    expect(Math.abs(onCard(last.x, scroll.maxScroll) - width / 2)).toBeLessThan(1)
  })

  it('follows the card\'s size (recomputed on resize)', () => {
    for (const [w, h] of [[300, 260], [412, 300], [960, 320]] as const) {
      const ppm = h / ROW_CAMERA.viewHeight
      const resized = rowScroll({ poses }, w, ppm)
      const left = rowRest({ poses }, resized, w, ppm, 'newest')
      const right = (last.x + last.thickness / 2 - resized.cameraStart - left / ppm) * ppm + w / 2
      expect(right).toBeCloseTo(w, 6)
    }
  })

  it('centres a row too short to fill the card, whichever end it starts at', () => {
    const { poses: few } = layoutRow(rowBooks(library).reverse())
    const short = rowScroll({ poses: few }, width, pxPerMetre)
    const span = (few.at(-1)!.x + few.at(-1)!.thickness / 2 - (few[0]!.x - few[0]!.thickness / 2)) * pxPerMetre
    expect(span).toBeLessThan(width)
    for (const start of ['newest', 'oldest'] as const) {
      const left = rowRest({ poses: few }, short, width, pxPerMetre, start)
      const at = (x: number) => (x - short.cameraStart - left / pxPerMetre) * pxPerMetre + width / 2
      const gapLeft = at(few[0]!.x - few[0]!.thickness / 2)
      const gapRight = width - at(few.at(-1)!.x + few.at(-1)!.thickness / 2)
      expect(gapLeft, start).toBeCloseTo(gapRight, 6)
    }
  })

  it('is 0 for an empty row, a single Book or a card without a size', () => {
    expect(rowRest({ poses: [] }, rowScroll({ poses: [] }, width, pxPerMetre), width, pxPerMetre, 'newest')).toBe(0)
    const one = poses.slice(0, 1)
    expect(rowRest({ poses: one }, rowScroll({ poses: one }, width, pxPerMetre), width, pxPerMetre, 'newest')).toBe(0)
    expect(rowRest({ poses }, rowScroll({ poses }, 0, pxPerMetre), 0, pxPerMetre, 'newest')).toBe(0)
  })
})

describe('rowProject (the dates, from the resting camera)', () => {
  it('matches RowScene\'s camera at rest, wherever it looks and however big the card', () => {
    for (const [cameraX, width, height] of [[0.4, 360, 300], [1.2, 412, 300], [0, 960, 320]] as const) {
      const camera = sceneCamera(cameraX, width, height)
      for (const [x, y] of [[cameraX, 0.272], [cameraX - 0.2, 0.15], [cameraX + 0.31, 0]] as const) {
        const point = new Vector3(x, y, 0).project(camera)
        const placed = rowProject(x, y, cameraX, width, height)
        expect(placed.x).toBeCloseTo((point.x + 1) / 2 * width, 6)
        expect(placed.y).toBeCloseTo((1 - point.y) / 2 * height, 6)
      }
    }
  })
})

describe('rowLabelNudge (a date at the card\'s edge stays readable)', () => {
  const width = 360
  const label = 60

  it('leaves dates well inside the card alone', () => {
    expect(rowLabelNudge(180, label, width)).toBe(0)
    expect(rowLabelNudge(label / 2 + ROW_LABEL_INSET, label, width)).toBe(0)
  })

  it('slides one at either edge in, the inset from the side', () => {
    expect(rowLabelNudge(4, label, width)).toBeCloseTo(label / 2 + ROW_LABEL_INSET - 4, 9)
    expect(4 - label / 2 + rowLabelNudge(4, label, width)).toBeCloseTo(ROW_LABEL_INSET, 9)
    expect(width - 4 + label / 2 + rowLabelNudge(width - 4, label, width)).toBeCloseTo(width - ROW_LABEL_INSET, 9)
  })

  it('stays in while its sheet is just off the card (January at a year row\'s rest)', () => {
    for (const x of [0, -11, -label / 2]) expect(x - label / 2 + rowLabelNudge(x, label, width), String(x)).toBeCloseTo(ROW_LABEL_INSET, 9)
  })

  it('then goes out with its sheet, without a jump', () => {
    const most = label + ROW_LABEL_INSET
    expect(rowLabelNudge(-label / 2, label, width)).toBeCloseTo(most, 9)
    expect(rowLabelNudge(-80, label, width)).toBeCloseTo(most, 9)
    // Its left edge follows the sheet off the card.
    expect(-80 - label / 2 + rowLabelNudge(-80, label, width)).toBeCloseTo(-80 + label / 2 + ROW_LABEL_INSET, 9)
  })
})
