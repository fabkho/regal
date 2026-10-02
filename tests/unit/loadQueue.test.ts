import { describe, expect, it } from 'vitest'
import { mostUrgent, reschedule, schedule, setBands } from '../../app/utils/covers/loadQueue'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** A job that records its start and finishes when told to. */
function job(name: string, started: string[]) {
  let finish!: () => void
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  return {
    run: () => {
      started.push(name)
      return done
    },
    finish: () => finish(),
  }
}

describe('mostUrgent', () => {
  it('picks the lowest priority, the earliest on a tie', () => {
    expect(mostUrgent([3, 1, 2])).toBe(1)
    expect(mostUrgent([2, 1, 1])).toBe(1)
    expect(mostUrgent([Infinity, Infinity])).toBe(0)
    expect(mostUrgent([])).toBe(-1)
  })
})

describe('schedule', () => {
  it('ranks Books queued together instead of starting the first ones', async () => {
    const started: string[] = []
    // Ten Books queued at once, the pile's bottom first; the top (priority 0) is on screen.
    const jobs = Array.from({ length: 10 }, (_, index) => job(`book${index}`, started))
    const all = jobs.map((entry, index) => schedule(entry.run, () => 9 - index))
    await tick()
    expect(started).toEqual(['book9', 'book8', 'book7', 'book6', 'book5', 'book4', 'book3', 'book2'])
    for (const entry of jobs) entry.finish()
    await Promise.all(all)
    expect(started.slice(8)).toEqual(['book1', 'book0'])
  })

  it('reads the priority again when a slot frees up (scrolling while loading)', async () => {
    const started: string[] = []
    let focus = 0
    const blockers = Array.from({ length: 8 }, (_, index) => job(`blocker${index}`, started))
    const running = blockers.map(entry => schedule(entry.run, () => -1))
    const near = job('near', started)
    const far = job('far', started)
    const queued = [schedule(near.run, () => Math.abs(0 - focus)), schedule(far.run, () => Math.abs(2 - focus))]
    await tick()
    // The view scrolls down to the far Book before a slot frees up.
    focus = 2
    blockers[0]!.finish()
    await running[0]
    await tick()
    expect(started.at(-1)).toBe('far')
    for (const entry of [...blockers, near, far]) entry.finish()
    await Promise.all([...running, ...queued])
  })

  it('keeps going after a failed job', async () => {
    await expect(schedule(() => Promise.reject(new Error('404')))).rejects.toThrow('404')
    await expect(schedule(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('holds a band to its slots until a scroll makes its jobs urgent', async () => {
    setBands([{ from: 100, max: 1 }])
    try {
      const started: string[] = []
      let focus = 0
      const jobs = ['a', 'b', 'c'].map(name => job(name, started))
      const done = jobs.map((entry, index) => schedule(entry.run, () => (index === 2 && focus === 1 ? 0 : 100 + index)))
      await tick()
      // Background: one at a time, the others wait though slots are free.
      expect(started).toEqual(['a'])
      // The view scrolls to c: it starts right away, without waiting for a to finish.
      focus = 1
      reschedule()
      expect(started).toEqual(['a', 'c'])
      for (const entry of jobs) entry.finish()
      await Promise.all(done)
      expect(started).toEqual(['a', 'c', 'b'])
    }
    finally {
      setBands([])
    }
  })
})
