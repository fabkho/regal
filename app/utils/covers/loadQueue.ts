// The load queue for Covers, asset images and blurbs: a few at a time, so a big
// Library doesn't flood the network or the resolver, most urgent first.
//
// A job's priority is a function, read again each time a slot frees up: the
// Stack ranks a Book by its distance from the middle of the view, so the Books
// on screen load first and scrolling while the pile loads pulls the Books
// scrolled to up the queue. Lower runs sooner; ties run in the order queued.
// A job may also belong to a band that only gets a few of the slots (see
// loadWindow.ts: background fill and faces seen only when a Book is taken
// out), so the jobs a scroll makes urgent always find a free slot.

/** How urgent a job is right now; lower runs sooner. */
export type Priority = () => number

/** Runs in queue order (no ranking). */
export const IN_ORDER: Priority = () => 0

const MAX_IN_FLIGHT = 8

/** Jobs from priority `from` on may hold at most `max` slots between them. */
export type Bands = readonly { from: number, max: number }[]

interface Job {
  start: () => void
  priority: Priority
}

const queue: Job[] = []
/** Priority of each job in flight, as it was when it started. */
const running: number[] = []
let pumpPending = false
let bands: Bands = []

/** Sets how many slots the less urgent bands of priorities may take (loadWindow.ts' LOAD_BANDS). */
export function setBands(value: Bands) {
  bands = value
}

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

/**
 * The job to start next, or -1: the most urgent one whose bands still have a
 * free slot (`inFlight` are the priorities of the jobs running).
 */
export function nextJob(priorities: readonly number[], inFlight: readonly number[], limits: Bands = [], maxInFlight = MAX_IN_FLIGHT): number {
  if (inFlight.length >= maxInFlight) return -1
  const free = (value: number) => limits.every(band =>
    value < band.from || inFlight.filter(running => running >= band.from).length < band.max)
  let best = -1
  for (let index = 0; index < priorities.length; index++) {
    const value = priorities[index]!
    if (best >= 0 && value >= priorities[best]!) continue
    if (free(value)) best = index
  }
  return best
}

const scratch: number[] = []

function pump() {
  pumpPending = false
  if (!queue.length) return
  // Priorities are read once per pump: starting a job doesn't change the others'.
  scratch.length = queue.length
  for (let index = 0; index < queue.length; index++) {
    const value = queue[index]!.priority()
    scratch[index] = Number.isNaN(value) ? Infinity : value
  }
  while (queue.length) {
    const index = nextJob(scratch, running, bands)
    if (index < 0) return
    const [job] = queue.splice(index, 1)
    const [value] = scratch.splice(index, 1)
    running.push(value!)
    job!.start()
  }
}

/** Reads the priorities again now, e.g. after a scroll made background jobs urgent. */
export function reschedule() {
  if (queue.length && running.length < MAX_IN_FLIGHT) pump()
}

const aborted = () => new DOMException('The load was dropped.', 'AbortError')

/**
 * Runs upstream-bound work a few at a time, the most urgent first. Starting
 * waits a tick, so Books queued together (all of them, once the Library is
 * in) are ranked together instead of the first few taking every slot. An
 * aborted `signal` drops a job that hasn't started (the task itself should
 * pass the signal on, e.g. to fetch).
 */
export function schedule<T>(task: () => Promise<T>, priority: Priority = IN_ORDER, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(aborted())
    const drop = () => {
      const index = queue.indexOf(job)
      if (index < 0) return
      queue.splice(index, 1)
      reject(aborted())
    }
    const job: Job = {
      priority,
      start: () => {
        signal?.removeEventListener('abort', drop)
        const slot = running[running.length - 1]!
        let pending: Promise<T>
        try {
          pending = task()
        }
        catch (error) {
          // A task that throws before it returns a promise still frees its slot.
          pending = Promise.reject(error)
        }
        pending.then(resolve, reject).finally(() => {
          running.splice(running.indexOf(slot), 1)
          pump()
        })
      },
    }
    signal?.addEventListener('abort', drop, { once: true })
    queue.push(job)
    if (!pumpPending) {
      pumpPending = true
      setTimeout(pump, 0)
    }
  })
}
