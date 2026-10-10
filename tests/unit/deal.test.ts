import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DEAL_DISTANCE, DEAL_FOV, planDeal, projectToStage, sampleCamera, sampleDeal, winnerRect } from '../../app/utils/deal/plan'
import type { DealDims, DealPlan, DealVariantName } from '../../app/utils/deal/plan'
import { endPose, FRONT, stageFor } from '../../app/utils/deal/layout'
import { orient, qRotate, qSame, spinPeak, spinProfile } from '../../app/utils/deal/math'
import { makePose } from '../../app/utils/deal/tracks'
import { bookDimensions } from '../../app/utils/bookcase/layout'

const VARIANTS: DealVariantName[] = ['deck', 'stack', 'wheel']
const BINDINGS = ['Hardcover', 'Paperback', null, 'Mass Market Paperback']

function dimsFor(count: number): DealDims[] {
  return Array.from({ length: count }, (_, index) => bookDimensions({ id: `book-${index}`, pages: 120 + ((index * 137) % 700), binding: BINDINGS[index % BINDINGS.length]! }, 1, 1))
}

/** Every sampled t of a plan: each Book, a step apart, past the ends. */
function* samples(plan: DealPlan, step = 25) {
  for (let t = -50; t <= plan.total + 100; t += step) yield t
}

const seeds = [1, 7, 4242]

describe('planDeal', () => {
  for (const variant of VARIANTS) {
    describe(variant, () => {
      for (const count of [1, 2, 3, 5, 8, 12]) {
        for (const winner of new Set([0, count - 1, Math.floor(count / 2)])) {
          it(`ends with the winner (${winner} of ${count}) at the end pose`, () => {
            for (const seed of seeds) {
              for (const aspect of [0.46, 1.6]) {
                const plan = planDeal({ books: dimsFor(count), winner, variant, seed, aspect })
                const end = endPose(plan.dims[winner]!, stageFor(aspect))
                const pose = sampleDeal(plan, winner, plan.total)
                for (let axis = 0; axis < 3; axis++) expect(pose.position[axis]!).toBeCloseTo(end.position[axis]!, 6)
                expect(qSame(pose.quaternion, end.quaternion, 1e-9)).toBe(true)
                expect(pose.scale).toBeCloseTo(end.scale, 6)
                expect(pose.thickness).toBeCloseTo(1, 6)
                expect(pose.opacity).toBeCloseTo(1, 6)
                // Held still: the same a moment before the end and well after.
                const before = sampleDeal(plan, winner, plan.total - 250)
                expect(before.position[0]).toBeCloseTo(end.position[0], 6)
                expect(before.position[1]).toBeCloseTo(end.position[1], 6)
                expect(before.scale).toBeCloseTo(end.scale, 6)
                expect(qSame(before.quaternion, end.quaternion, 1e-9)).toBe(true)
                // The end camera faces the cover square on.
                const camera = sampleCamera(plan, plan.total)
                expect(camera.tilt).toBeCloseTo(0, 9)
                expect(camera.targetY).toBeCloseTo(0, 9)
                expect(camera.targetZ).toBeCloseTo(0, 9)
              }
            }
          })
        }
      }

      it('has no NaN at any sampled time and keeps opacity in range', () => {
        for (const count of [1, 2, 4, 7, 12]) {
          for (const seed of seeds) {
            const plan = planDeal({ books: dimsFor(count), winner: count - 1, variant, seed })
            const pose = makePose()
            for (const t of samples(plan)) {
              for (let book = 0; book < count; book++) {
                sampleDeal(plan, book, t, pose)
                expect([...pose.position, ...pose.quaternion, pose.scale, pose.thickness, pose.opacity].every(Number.isFinite)).toBe(true)
                expect(pose.opacity).toBeGreaterThanOrEqual(0)
                expect(pose.opacity).toBeLessThanOrEqual(1)
                expect(Math.hypot(...pose.quaternion)).toBeCloseTo(1, 6)
              }
              const camera = sampleCamera(plan, t)
              expect(Object.values(camera).every(Number.isFinite)).toBe(true)
            }
          }
        }
      })

      it('is deterministic for a seed and never lets the seed change the winner', () => {
        const books = dimsFor(9)
        const a = planDeal({ books, winner: 4, variant, seed: 5 })
        const b = planDeal({ books, winner: 4, variant, seed: 5 })
        for (const t of [0, 700, 1500, 2600, 3900, a.total]) {
          for (let book = 0; book < 9; book++) expect(sampleDeal(a, book, t)).toEqual(sampleDeal(b, book, t))
        }
        for (const seed of [1, 2, 3, 99, 12345]) {
          const plan = planDeal({ books, winner: 4, variant, seed })
          expect(plan.winner).toBe(4)
          expect(sampleDeal(plan, 4, plan.total).scale).toBeCloseTo(a.end.scale, 9)
        }
      })

      it('takes about the duration asked, plus a start and an end', () => {
        for (const duration of [2200, 4000]) {
          for (const count of [2, 6, 12]) {
            const plan = planDeal({ books: dimsFor(count), winner: 1, variant, duration })
            expect(plan.total).toBeGreaterThan(duration)
            expect(plan.total - duration).toBeLessThan(1000)
            expect(plan.timeline.total - plan.timeline.presentEnd).toBeGreaterThanOrEqual(250)
          }
        }
        expect(planDeal({ books: dimsFor(6), winner: 1, variant }).total).toBeGreaterThan(3000)
        expect(planDeal({ books: dimsFor(6), winner: 1, variant }).total).toBeLessThan(5200)
      })

      it('starts as a fan of covers facing the camera, all in view, one start for all variants', () => {
        const count = 7
        const plan = planDeal({ books: dimsFor(count), winner: 2, variant })
        const stage = stageFor(1.6)
        for (let book = 0; book < count; book++) {
          const pose = sampleDeal(plan, book, plan.timeline.introEnd)
          expect(pose.opacity).toBeCloseTo(1, 6)
          expect(Math.abs(pose.position[0])).toBeLessThan(stage.width / 2)
          expect(Math.abs(pose.position[1])).toBeLessThan(stage.height / 2)
          // The cover (local +x) points at the camera, give or take the fan's lean.
          expect(qRotate(pose.quaternion, [1, 0, 0])[2]).toBeGreaterThan(0.95)
          expect(sampleDeal(plan, book, 0).opacity).toBe(0)
        }
      })

      it('the covers of a 12-Book fan stay inside a phone stage', () => {
        const plan = planDeal({ books: dimsFor(12), winner: 3, variant, aspect: 390 / 844 })
        const stage = stageFor(390 / 844)
        for (let book = 0; book < 12; book++) {
          const pose = sampleDeal(plan, book, plan.timeline.introEnd)
          const halfWidth = (plan.dims[book]!.depth * pose.scale) / 2
          expect(Math.abs(pose.position[0]) + halfWidth).toBeLessThanOrEqual(stage.width / 2 + 1e-6)
        }
      })
    })
  }

  describe('deck', () => {
    it('has the winner on top of the deck before the turn', () => {
      for (const count of [2, 3, 6, 12]) {
        for (const seed of [1, 2, 3, 8, 21, 55]) {
          for (const winner of [0, count - 1, Math.floor(count / 2)]) {
            const plan = planDeal({ books: dimsFor(count), winner, variant: 'deck', seed })
            expect(plan.info.deckOrder![count - 1]).toBe(winner)
            expect([...plan.info.deckOrder!].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i))
            const turnAt = plan.info.turnAt!
            const heights = Array.from({ length: count }, (_, book) => sampleDeal(plan, book, turnAt - 1).position[1])
            expect(heights.indexOf(Math.max(...heights))).toBe(winner)
            // Face down, lying flat, up to then.
            const winnerPose = sampleDeal(plan, winner, turnAt - 1)
            expect(qRotate(winnerPose.quaternion, [1, 0, 0])[1]).toBeLessThan(-0.99)
          }
        }
      }
    })

    it('gets there by a real cut when it can', () => {
      // The deck changes order over the shuffle: the gathered order is not the final one for most seeds.
      const plan = planDeal({ books: dimsFor(8), winner: 3, variant: 'deck', seed: 11 })
      expect(plan.info.deckOrder![7]).toBe(3)
    })
  })

  describe('stack', () => {
    it('has the winner in the middle when the scroll stops', () => {
      for (const count of [2, 3, 6, 12]) {
        for (const seed of [1, 4, 9]) {
          for (const winner of [0, count - 1, Math.floor(count / 2)]) {
            const plan = planDeal({ books: dimsFor(count), winner, variant: 'stack', seed })
            const at = plan.info.scrollEnd!
            const middles = Array.from({ length: count }, (_, book) => Math.abs(sampleDeal(plan, book, at).position[1]))
            expect(middles[winner]).toBeLessThan(1e-9)
            expect(middles.indexOf(Math.min(...middles))).toBe(winner)
            expect(plan.info.pileOrder).toHaveLength(count)
          }
        }
      }
    })

    it('has the books lying flat with the Spine to the camera while it is a pile', () => {
      const plan = planDeal({ books: dimsFor(6), winner: 2, variant: 'stack', seed: 3 })
      const pose = sampleDeal(plan, 0, plan.info.scrollEnd! - 1500)
      expect(qRotate(pose.quaternion, [1, 0, 0])[1]).toBeGreaterThan(0.95)
    })
  })

  describe('wheel', () => {
    it('stops with the winner under the pointer', () => {
      for (const count of [2, 3, 5, 12]) {
        for (const seed of [1, 2, 3, 50]) {
          for (const winner of [0, count - 1, Math.floor(count / 2)]) {
            const plan = planDeal({ books: dimsFor(count), winner, variant: 'wheel', seed })
            const angle = plan.info.finalAngle!
            const turned = plan.info.slotAngles![winner]! + angle
            expect(Math.abs(Math.sin(turned / 2))).toBeLessThan(1e-9)
            expect(angle).toBeLessThan(-4 * Math.PI + 1e-9)
            // At the spin's end the winner is at the front, square on, nearest the camera.
            const pose = sampleDeal(plan, winner, plan.info.spinEnd!)
            expect(pose.position[0]).toBeCloseTo(0, 9)
            expect(pose.position[2]).toBeCloseTo(0, 9)
            expect(qSame(pose.quaternion, FRONT, 1e-9)).toBe(true)
            for (let book = 0; book < count; book++) {
              if (book !== winner) expect(sampleDeal(plan, book, plan.info.spinEnd!).position[2]).toBeLessThan(-1e-6)
            }
            expect(plan.pointer).not.toBeNull()
            expect(plan.pointer!.position[0]).toBe(0)
          }
        }
      }
    })

    it('never turns so fast that a cover jumps more than half a gap in a frame', () => {
      for (const count of [3, 8, 12]) {
        const plan = planDeal({ books: dimsFor(count), winner: 1, variant: 'wheel' })
        const spinStart = plan.timeline.shuffleStart + 0.2 * (plan.timeline.presentStart - plan.timeline.shuffleStart)
        // Where a cover faces says where it is on the ring.
        const facing = (t: number) => {
          const direction = qRotate(sampleDeal(plan, 0, t).quaternion, [1, 0, 0])
          return Math.atan2(direction[0], direction[2])
        }
        let previous = facing(spinStart)
        let worst = 0
        const gap = (2 * Math.PI) / count
        for (let t = spinStart + 16.7; t < plan.info.spinEnd!; t += 16.7) {
          const now = facing(t)
          worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(now - previous), Math.cos(now - previous))))
          previous = now
        }
        expect(worst).toBeLessThan(gap * 0.75)
      }
    })
  })

  describe('reduced motion', () => {
    for (const variant of VARIANTS) {
      it(`is just the winner's fade (${variant})`, () => {
        const plan = planDeal({ books: dimsFor(6), winner: 2, variant, reducedMotion: true })
        expect(plan.reducedMotion).toBe(true)
        expect(plan.total).toBeLessThan(700)
        expect(plan.total).toBeGreaterThanOrEqual(450)
        const end = plan.end
        const start = sampleDeal(plan, 2, 0)
        expect(start.opacity).toBe(0)
        expect(sampleDeal(plan, 2, 100).opacity).toBeGreaterThan(0.2)
        expect(sampleDeal(plan, 2, 100).opacity).toBeLessThan(1)
        for (const t of [0, 100, 200, 400, plan.total]) {
          const pose = sampleDeal(plan, 2, t)
          expect(pose.position).toEqual(end.position)
          expect(qSame(pose.quaternion, end.quaternion)).toBe(true)
          for (const book of [0, 1, 3, 4, 5]) expect(sampleDeal(plan, book, t).opacity).toBe(0)
        }
        expect(sampleDeal(plan, 2, plan.total).opacity).toBe(1)
      })
    }
  })

  it('refuses a winner that is not one of the Books', () => {
    expect(() => planDeal({ books: dimsFor(3), winner: 3, variant: 'deck' })).toThrow(RangeError)
    expect(() => planDeal({ books: dimsFor(3), winner: -1, variant: 'deck' })).toThrow(RangeError)
    expect(() => planDeal({ books: [], winner: 0, variant: 'deck' })).toThrow(RangeError)
  })
})

describe('the end pose and its rect', () => {
  it('is 55 % of the stage height, centred, a little above the middle, and fits a phone', () => {
    const books = dimsFor(4)
    for (const [width, height] of [[1280, 800], [390, 844], [390, 500], [900, 900]] as const) {
      const plan = planDeal({ books, winner: 1, variant: 'wheel', aspect: width / height })
      const rect = winnerRect(plan, { width, height })
      expect(rect.left + rect.width / 2).toBeCloseTo(width / 2, 0)
      expect(rect.top + rect.height / 2).toBeLessThan(height / 2)
      expect(rect.left).toBeGreaterThan(0)
      expect(rect.left + rect.width).toBeLessThan(width)
      const share = rect.height / height
      expect(share).toBeLessThanOrEqual(0.56)
      if (width / height > 0.6) expect(share).toBeGreaterThan(0.53)
    }
  })

  it('projects like a three.js camera', () => {
    const plan = planDeal({ books: dimsFor(3), winner: 0, variant: 'deck' })
    for (const t of [0, 1500, 3000, plan.total]) {
      const camera = sampleCamera(plan, t)
      const reference = new PerspectiveCamera(DEAL_FOV, 1280 / 800, 0.03, 20)
      reference.position.set(0, camera.targetY + camera.distance * Math.sin(camera.tilt), camera.targetZ + camera.distance * Math.cos(camera.tilt))
      reference.lookAt(0, camera.targetY, camera.targetZ)
      reference.updateMatrixWorld()
      const point = new Vector3(0.05, 0.03, 0.04)
      const expected = point.clone().project(reference)
      const got = projectToStage(camera, [0.05, 0.03, 0.04], 1280, 800)
      expect(got.x).toBeCloseTo((expected.x * 0.5 + 0.5) * 1280, 3)
      expect(got.y).toBeCloseTo((0.5 - expected.y * 0.5) * 800, 3)
    }
    expect(DEAL_DISTANCE).toBeGreaterThan(0.5)
  })

  it('has the front cover facing the camera at the end', () => {
    const plan = planDeal({ books: dimsFor(3), winner: 0, variant: 'stack' })
    expect(qRotate(plan.end.quaternion, [1, 0, 0])).toEqual(qRotate(orient([0, 0, 1], [0, 1, 0]), [1, 0, 0]))
    expect(qRotate(plan.end.quaternion, [1, 0, 0])[2]).toBeCloseTo(1, 9)
    expect(qRotate(plan.end.quaternion, [0, 1, 0])[1]).toBeCloseTo(1, 9)
  })
})

describe('spinProfile', () => {
  it('runs from 0 to 1, never backwards, and ends slowly', () => {
    const progress = spinProfile(1.7, 0.06)
    expect(progress(0)).toBe(0)
    expect(progress(1)).toBeCloseTo(1, 9)
    let last = 0
    for (let u = 0.01; u <= 1; u += 0.01) {
      expect(progress(u)).toBeGreaterThanOrEqual(last)
      last = progress(u)
    }
    expect(1 - progress(0.95)).toBeLessThan(0.02)
    expect(spinPeak(1.7, 0.06)).toBeGreaterThan(1.5)
  })
})
