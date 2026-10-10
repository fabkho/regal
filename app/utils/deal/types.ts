// Types of the deal's plan (utils/deal/plan.ts) shared by its variants.
import type { Vec3 } from './math'
import type { DealPose, Segment, Track, TrackBuilder } from './tracks'

export type DealVariantName = 'deck' | 'stack' | 'wheel'

/** The measures of a Book the plan needs (bookDimensions: Spine thickness, height, cover width). */
export interface DealDims {
  thickness: number
  height: number
  /** Front to back: the width of the front cover. */
  depth: number
}

/** Where the camera is: an orbit about (0, targetY, targetZ), tilted down by `tilt` radians. */
export interface DealCamera {
  tilt: number
  targetY: number
  targetZ: number
  distance: number
}

export interface DealPlanInput {
  books: readonly DealDims[]
  /** Index into `books`; decided by the host, never here. */
  winner: number
  variant: DealVariantName
  /** The shuffle part, ms (default 4000). */
  duration?: number
  /** Varies the look (riffle order, wobble), never the winner. */
  seed?: number
  /** The stage's width / height (default 1.6). */
  aspect?: number
  /** Just the winner fading in at its end pose. */
  reducedMotion?: boolean
}

/** The stage the plan is made for. */
export interface DealStage {
  aspect: number
  /** Visible world height at the target plane. */
  height: number
  width: number
}

export interface DealTimeline {
  /** The covers have come into their fan. */
  introEnd: number
  /** The variant's middle begins. */
  shuffleStart: number
  /** The winner starts for its end pose (the variant's last part). */
  presentStart: number
  /** The winner rests in the end pose. */
  presentEnd: number
  /** `picked` is due: the end held still. */
  total: number
}

/** A floor that catches the shadow: a horizontal plane at `y`. */
export interface DealFloor {
  y: number
  opacity: (t: number) => number
}

/** The wheel's fixed marker. */
export interface DealPointer {
  position: Vec3
  opacity: (t: number) => number
}

export interface DealPlan {
  variant: DealVariantName
  count: number
  winner: number
  reducedMotion: boolean
  /** The shuffle part as asked, ms. */
  duration: number
  seed: number
  stage: DealStage
  timeline: DealTimeline
  /** Ms until the end is held still: `timeline.total`. */
  total: number
  dims: readonly DealDims[]
  tracks: Track[]
  camera: Segment<DealCamera>[]
  floor: DealFloor | null
  pointer: DealPointer | null
  /** The winner at rest: front cover square to the camera. */
  end: DealPose
  endCamera: DealCamera
  /** What each variant decided, for tests and tuning. */
  info: {
    /** deck: the order (bottom to top) of the deck when it has been cut: the winner is last. */
    deckOrder?: number[]
    /** deck: when the top card is lifted. */
    turnAt?: number
    /** stack: the pile's order (bottom to top) when the scroll stops, and when. */
    pileOrder?: number[]
    scrollEnd?: number
    /** wheel: the ring's angle (rad) when the spin has settled, where each Book stands (rad), and when. */
    finalAngle?: number
    slotAngles?: number[]
    spinEnd?: number
  }
}

/** What a variant adds to the common intro and end (its steps go into the builders). */
export interface VariantPlan {
  camera: Segment<DealCamera>[]
  floor?: DealFloor | null
  pointer?: DealPointer | null
  info: DealPlan['info']
}

/** What a variant builds from. */
export interface VariantContext {
  dims: readonly DealDims[]
  winner: number
  stage: DealStage
  random: () => number
  /** The winner at rest. */
  end: DealPose
  timeline: DealTimeline
  /** Per Book, a builder at its fan pose from `introEnd` on: the variant continues each from there. */
  builders: TrackBuilder[]
  /** The camera the fan is seen with. */
  startCamera: DealCamera
}
