// The load queue for Covers, asset images and blurbs: a few at a time, so a big
// Library doesn't flood the network or the resolver, most urgent first.
//
// A job's priority is a function, read again each time a slot frees up: the
// Stack ranks a Book by its distance from the middle of the view, so the Books
// on screen load first and scrolling while the pile loads pulls the Books
// scrolled to up the queue. Lower runs sooner; ties run in the order queued.

/** How urgent a job is right now; lower runs sooner. */
export type Priority = () => number

/** Runs in queue order (no ranking). */
export const IN_ORDER: Priority = () => 0

const MAX_IN_FLIGHT = 6

interface Job {
  start: () => void
  priority: Priority
}

const queue: Job[] = []
let inFlight = 0
let pumpPending = false

/** Index of the most urgent job: the lowest priority, the earliest queued on a tie. */
export function mostUrgent(priorities: readonly number[]): number {
  let best = -1
  let bestValue = Infinity
  for (let index = 0; index < priorities.length; index++) {
    const value = priorities[index]!
    if (best < 0 || value < bestValue) {
      best = index
      bestValue = value
    }
  }
  return best
}

const scratch: number[] = []

function pump() {
  pumpPending = false
  while (inFlight < MAX_IN_FLIGHT && queue.length) {
    scratch.length = queue.length
    for (let index = 0; index < queue.length; index++) {
      const value = queue[index]!.priority()
      scratch[index] = Number.isNaN(value) ? Infinity : value
    }
    const [job] = queue.splice(mostUrgent(scratch), 1)
    inFlight++
    job!.start()
  }
}

/**
 * Runs upstream-bound work a few at a time, the most urgent first. Starting
 * waits a tick, so Books queued together (all of them, once the manifest is
 * in) are ranked together instead of the first few taking every slot.
 */
export function schedule<T>(task: () => Promise<T>, priority: Priority = IN_ORDER): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      priority,
      start: () => {
        task().then(resolve, reject).finally(() => {
          inFlight--
          pump()
        })
      },
    })
    if (!pumpPending) {
      pumpPending = true
      setTimeout(pump, 0)
    }
  })
}
