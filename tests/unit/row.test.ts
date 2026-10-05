import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { layoutRow, ROW_CAMERA, ROW_FOCUS_GAP, ROW_LABEL_GAP, ROW_LABEL_HYSTERESIS, ROW_LABEL_INSET, ROW_SHEET, rowBooks, rowFocusLabelTop, rowLabelEstimate, rowLabelNudge, rowLabelPlan, rowLabelReach, rowLabelSlots, rowLabelTexts, rowProject, rowRest, rowScroll } from '../../app/utils/row/layout'
import type { RowMarker } from '../../app/utils/row/layout'

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

describe('rowLabelTexts', () => {
  const markers: RowMarker[] = [
    { key: 'a', label: 'JAN 2026', count: 1, x: 0, height: 0.2 },
    { key: 'b', label: 'FEB 2026', count: 2, x: 0.01, height: 0.2 },
    { key: 'c', label: 'MAR 2025', count: 3, x: 0.5, height: 0.2 },
  ]

  it('sets the month with its year small', () => {
    expect(rowLabelTexts(markers).map(label => [label.key, label.text, label.small])).toEqual([['a', 'JAN', '2026'], ['b', 'FEB', '2026'], ['c', 'MAR', '2025']])
  })

  it('drops the year when the whole row is one year', () => {
    expect(rowLabelTexts(markers.slice(0, 2)).map(label => label.small)).toEqual(['', ''])
  })

  it('keeps a status as it is', () => {
    expect(rowLabelTexts([{ key: 'r', label: 'READING', count: 1, x: 0, height: 0.2 }]).map(label => [label.text, label.small])).toEqual([['READING', '']])
  })
})

/** Dates for a row: a month every `spacing` metres (sheets), one count each. */
function monthLabels(months: number, spacing: number, firstMonth = 0) {
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return rowLabelTexts(Array.from({ length: months }, (_, index): RowMarker => {
    const at = firstMonth + index
    return { key: `m${index}`, label: `${names[at % 12]} ${2025 + Math.floor(at / 12)}`, count: 1 + (index % 4), x: index * spacing, height: 0.2 }
  }))
}

describe('rowLabelPlan (dates never collide, the month at the resting end wins)', () => {
  const pxPerMetre = 300 / ROW_CAMERA.viewHeight
  const nobody = new Map<string, number>()

  it('shows every date when the months are far apart', () => {
    const plan = rowLabelPlan(monthLabels(6, 0.2), nobody, pxPerMetre)
    expect(plan.every(label => label.shown)).toBe(true)
  })

  it('collapses the earlier of two months a few Books apart to its leader line', () => {
    // DEC 2025 and JAN 2026 44 px apart; dates are about 70 px wide.
    const labels = monthLabels(2, 44 / pxPerMetre, 11)
    expect(labels.map(label => `${label.text} ${label.small}`)).toEqual(['DEC 2025', 'JAN 2026'])
    expect(rowLabelPlan(labels, nobody, pxPerMetre).map(label => label.shown)).toEqual([false, true])
  })

  it('lets the oldest month win in a row that starts at its oldest (a year row\'s January)', () => {
    const labels = monthLabels(2, 30 / pxPerMetre)
    expect(rowLabelPlan(labels, nobody, pxPerMetre, 'oldest').map(label => label.shown)).toEqual([true, false])
  })

  it('keeps the date that clears the gap exactly, and not one closer', () => {
    const width = rowLabelEstimate(monthLabels(1, 0)[0]!)
    const apart = (px: number) => rowLabelPlan(monthLabels(2, px / pxPerMetre), nobody, pxPerMetre).map(label => label.shown)
    expect(apart(width + ROW_LABEL_GAP)).toEqual([true, true])
    expect(apart(width + ROW_LABEL_GAP - 1)).toEqual([false, true])
  })

  it('chooses by the measured widths when it has them', () => {
    const labels = monthLabels(2, 60 / pxPerMetre)
    expect(rowLabelPlan(labels, new Map([['m0', 40], ['m1', 40]]), pxPerMetre).map(label => label.shown)).toEqual([true, true])
    expect(rowLabelPlan(labels, new Map([['m0', 80], ['m1', 80]]), pxPerMetre).map(label => label.shown)).toEqual([false, true])
  })

  it('thins a run of close months from the newest back', () => {
    const plan = rowLabelPlan(monthLabels(7, 30 / pxPerMetre), nobody, pxPerMetre)
    expect(plan.at(-1)!.shown).toBe(true)
    const shown = plan.filter(label => label.shown)
    expect(shown.length).toBeLessThan(plan.length)
    for (let index = 1; index < shown.length; index++) {
      const a = shown[index - 1]!
      const b = shown[index]!
      expect((b.x - a.x) * pxPerMetre).toBeGreaterThanOrEqual((a.width + b.width) / 2 + ROW_LABEL_GAP - 1e-9)
    }
  })

  it('does not depend on the scroll or on the dates around it', () => {
    const labels = monthLabels(20, 41 / pxPerMetre)
    const whole = rowLabelPlan(labels, nobody, pxPerMetre).map(label => label.shown)
    // The same months without the oldest ones: the newest ones decide the same way.
    const tail = rowLabelPlan(labels.slice(8), nobody, pxPerMetre).map(label => label.shown)
    expect(tail).toEqual(whole.slice(8))
  })
})

describe('rowLabelSlots (dates at the card\'s edge give or take room)', () => {
  const width = 360
  const wide = 70
  const REACH = rowLabelReach(300 / ROW_CAMERA.viewHeight)

  it('leaves dates inside the card where their sheets are', () => {
    const slots = rowLabelSlots([{ key: 'a', x: 100, width: wide }, { key: 'b', x: 250, width: wide }], width)
    expect([...slots.values()]).toEqual([{ nudge: 0, shown: true }, { nudge: 0, shown: true }])
  })

  it('keeps the later of two dates sliding in together (DEC 2025 and JAN 2026 at the left)', () => {
    // Both would slide to the same place: the one nearer the middle (JAN) stays.
    const slots = rowLabelSlots([{ key: 'dec', x: -10, width: wide }, { key: 'jan', x: 30, width: wide }], width)
    const dec = slots.get('dec')!
    const jan = slots.get('jan')!
    expect(dec.nudge).toBeGreaterThan(0)
    expect([dec.shown, jan.shown]).toEqual([false, true])
  })

  it('keeps the one nearer the middle when two slide in from the same side', () => {
    const slots = rowLabelSlots([{ key: 'old', x: -5, width: wide }, { key: 'new', x: 4, width: wide }], width)
    expect(slots.get('new')!.shown).toBe(true)
    expect(slots.get('old')!.shown).toBe(false)
  })

  it('steps the neighbour back at the right edge too', () => {
    const slots = rowLabelSlots([{ key: 'jun', x: 270, width: wide }, { key: 'oct', x: 350, width: wide }], width)
    expect(slots.get('oct')!.nudge).toBeLessThan(0)
    expect(slots.get('jun')!.shown).toBe(false)
    expect(slots.get('oct')!.shown).toBe(true)
  })

  it('collapses a date to its leader line, whole or not at all, once its sheet is too far off the card', () => {
    const left = rowLabelSlots([{ key: 'leaving', x: -REACH - 1, width: wide }, { key: 'next', x: 40, width: wide }], width)
    expect(left.get('leaving')!.shown).toBe(false)
    expect(left.get('next')!.shown).toBe(true)
    const right = rowLabelSlots([{ key: 'coming', x: width + REACH + 1, width: wide }], width)
    expect(right.get('coming')!.shown).toBe(false)
    // Just within reach it is whole at the edge.
    const near = rowLabelSlots([{ key: 'jan', x: -REACH, width: wide }], width).get('jan')!
    expect(near.shown).toBe(true)
    expect(-REACH - wide / 2 + near.nudge).toBeCloseTo(ROW_LABEL_INSET, 9)
  })

  it('comes back at the card\'s edge only with the hysteresis', () => {
    const at = (x: number, hidden: string[]) => rowLabelSlots([{ key: 'd', x, width: wide }], width, new Set(hidden)).get('d')!.shown
    expect(at(-REACH + 1, [])).toBe(true)
    expect(at(-REACH + 1, ['d'])).toBe(false)
    expect(at(-REACH + ROW_LABEL_HYSTERESIS + 1, ['d'])).toBe(true)
    expect(at(width + REACH - 1, ['d'])).toBe(false)
    expect(at(width + REACH - ROW_LABEL_HYSTERESIS - 1, ['d'])).toBe(true)
  })

  it('returns a date that stepped back only with more room, so it does not flicker at the threshold', () => {
    // DEC slid in to [6, 76]; JAN's box starts `room` px after it.
    const at = (room: number, hidden: string[]) => rowLabelSlots(
      [{ key: 'dec', x: -5, width: wide }, { key: 'jan', x: 41 + wide + room, width: wide }],
      width,
      new Set(hidden),
    ).get('jan')!.shown
    expect(at(ROW_LABEL_GAP - 1, [])).toBe(false)
    expect(at(ROW_LABEL_GAP + 1, [])).toBe(true)
    // Having stepped back, it waits for the gap and the hysteresis...
    expect(at(ROW_LABEL_GAP + 1, ['jan'])).toBe(false)
    expect(at(ROW_LABEL_GAP + ROW_LABEL_HYSTERESIS - 1, ['jan'])).toBe(false)
    // ... and comes back once it has them.
    expect(at(ROW_LABEL_GAP + ROW_LABEL_HYSTERESIS + 1, ['jan'])).toBe(true)
  })

  it('does not hold a date back for a neighbour it never clashed with', () => {
    // Planned apart by the gap + 1 px (more than the gap, less than gap + hysteresis): stepping back for something else must not trap it.
    const slots = rowLabelSlots([{ key: 'a', x: 150, width: wide }, { key: 'b', x: 150 + wide + ROW_LABEL_GAP + 1, width: wide }], width, new Set(['b']))
    expect(slots.get('b')!.shown).toBe(true)
  })

  /** A sweep of scroll positions over a row; the dates in the card, shown, as boxes. */
  function sweep(plan: ReturnType<typeof rowLabelPlan>, cardWidth: number, positions: number[]) {
    const hidden = new Set<string>()
    const history: Map<string, boolean[]> = new Map()
    const frames = positions.map((scroll) => {
      const items = plan.filter(label => label.shown)
        .map(label => ({ key: label.key, x: label.x * (300 / ROW_CAMERA.viewHeight) - scroll, width: label.width }))
        .filter(item => item.x > -300 && item.x < cardWidth + 300)
      const slots = rowLabelSlots(items, cardWidth, hidden)
      hidden.clear()
      const boxes = items.map((item) => {
        const slot = slots.get(item.key)!
        if (!slot.shown) hidden.add(item.key)
        const centre = item.x + slot.nudge
        const state = history.get(item.key) ?? []
        state.push(slot.shown)
        history.set(item.key, state)
        return { key: item.key, from: centre - item.width / 2, to: centre + item.width / 2, shown: slot.shown }
      })
      return boxes.filter(box => box.shown).sort((a, b) => a.from - b.from)
    })
    return { frames, history }
  }

  const pxPerMetre = 300 / ROW_CAMERA.viewHeight
  for (const [name, months, spacing] of [['close months', 30, 40], ['very close months', 30, 18], ['mixed', 30, 63], ['wide months', 12, 160]] as const) {
    for (const cardWidth of [220, 360, 412, 720]) {
      it(`shows every date whole and never overlaps at any scroll position: ${name}, card ${cardWidth} px`, () => {
        const plan = rowLabelPlan(monthLabels(months, spacing / pxPerMetre), new Map(), pxPerMetre)
        const positions = Array.from({ length: Math.ceil((months * spacing + cardWidth) / 3) }, (_, index) => index * 3 - cardWidth / 2)
        const { frames } = sweep(plan, cardWidth, positions)
        for (const [index, boxes] of frames.entries()) {
          // Every date shown is whole inside the card, the inset from its sides.
          for (const box of boxes) {
            expect(box.from, `scroll ${positions[index]}: ${box.key}`).toBeGreaterThanOrEqual(ROW_LABEL_INSET - 1e-9)
            expect(box.to, `scroll ${positions[index]}: ${box.key}`).toBeLessThanOrEqual(cardWidth - ROW_LABEL_INSET + 1e-9)
          }
          for (let box = 1; box < boxes.length; box++) {
            expect(boxes[box]!.from - boxes[box - 1]!.to, `scroll ${positions[index]}: ${boxes[box - 1]!.key} / ${boxes[box]!.key}`).toBeGreaterThanOrEqual(ROW_LABEL_GAP - 1e-9)
          }
        }
      })

      it(`no date blinks (shown/hidden for a few px of scroll only): ${name}, card ${cardWidth} px`, () => {
        const plan = rowLabelPlan(monthLabels(months, spacing / pxPerMetre), new Map(), pxPerMetre)
        const positions = Array.from({ length: Math.ceil((months * spacing + cardWidth) / 1) }, (_, index) => index - cardWidth / 2)
        const { history } = sweep(plan, cardWidth, positions)
        for (const [key, states] of history) {
          // Runs of one state in 1 px steps; all but the first and the last (cut by the sweep or the date coming into the list) last a while.
          const runs: number[] = []
          for (const [index, state] of states.entries()) {
            if (index > 0 && state === states[index - 1]) runs[runs.length - 1]!++
            else runs.push(1)
          }
          expect(runs.slice(1, -1).every(run => run >= ROW_LABEL_HYSTERESIS), `${key}: ${runs.join(',')}`).toBe(true)
        }
      })
    }
  }
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

describe('rowLabelNudge (a date at the card\'s edge stays whole)', () => {
  const width = 360
  const label = 60
  const REACH = rowLabelReach(300 / ROW_CAMERA.viewHeight)

  it('leaves dates well inside the card alone', () => {
    expect(rowLabelNudge(180, label, width)).toBe(0)
    expect(rowLabelNudge(label / 2 + ROW_LABEL_INSET, label, width)).toBe(0)
  })

  it('slides one at either edge in, the whole box the inset from the side', () => {
    expect(rowLabelNudge(4, label, width)).toBeCloseTo(label / 2 + ROW_LABEL_INSET - 4, 9)
    expect(4 - label / 2 + rowLabelNudge(4, label, width)).toBeCloseTo(ROW_LABEL_INSET, 9)
    expect(width - 4 + label / 2 + rowLabelNudge(width - 4, label, width)).toBeCloseTo(width - ROW_LABEL_INSET, 9)
  })

  it('keeps it whole while its sheet is just off the card (January at a year row\'s rest)', () => {
    for (const x of [0, -REACH]) expect(x - label / 2 + rowLabelNudge(x, label, width), String(x)).toBeCloseTo(ROW_LABEL_INSET, 9)
    for (const x of [width, width + REACH]) expect(x + label / 2 + rowLabelNudge(x, label, width), String(x)).toBeCloseTo(width - ROW_LABEL_INSET, 9)
  })

  it('never lets any date reach beyond the inset, wherever its sheet is', () => {
    for (let x = -300; x <= width + 300; x += 7) {
      const centre = x + rowLabelNudge(x, label, width)
      expect(centre - label / 2, String(x)).toBeGreaterThanOrEqual(ROW_LABEL_INSET - 1e-9)
      expect(centre + label / 2, String(x)).toBeLessThanOrEqual(width - ROW_LABEL_INSET + 1e-9)
    }
  })

  it('centres a date in a card too narrow for it', () => {
    expect(100 + rowLabelNudge(100, 80, 70)).toBeCloseTo(35, 9)
  })
})
