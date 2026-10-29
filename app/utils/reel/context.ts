// What a Reel's card (components/reel/Card.vue) shares with its 3D
// (components/reel/Scene.vue, Books.vue), as the row's RowContext does: plain
// objects the scene reads every frame (no reactivity per frame), and a few
// refs for what changes rarely. The Pick itself is the reel's own Pick context
// (composables/useBookPick.ts), injected through the canvas.
import type { Ref } from 'vue'
import type { AssetFaces } from '#layers/regal/app/utils/covers/bookAssets'
import type { Book } from '#layers/regal/shared/types/book'
import type { ReelEntrance, ReelEntrancePlan } from '#layers/regal/app/utils/reel/entrance'
import type { ReelEdge } from '#layers/regal/app/utils/reel/edge'

/** What RegalBooksReel's `focus` and `open` events carry: the Book, its id and its place in the reel. */
export interface ReelBookEvent {
  id: string
  index: number
  book: Book
}

export interface ReelBreakout {
  /** The canvas covers the viewport (a Book is out, or on its way back). */
  active: boolean
  /** The stage's box on screen when it broke out (viewport px). */
  rect: { left: number, top: number, width: number, height: number }
}

/** The entrance of the Books (utils/reel/entrance.ts): the card sets the mode and the start, ReelBooks plans and plays it. */
export interface ReelEntranceState {
  mode: ReelEntrance
  /** The plan, made on the first frame from the Books it shows. */
  plan: ReelEntrancePlan | null
  /** performance.now() when the Books start to come in (the canvas has taken over); -1 before. */
  startedAt: number
  /** Every Book is home (or there is none): the Books are drawn as they rest. */
  done: boolean
  /** performance.now() of the frame that landed the last Book; -1 before. */
  doneAt: number
}

export interface ReelContext {
  /** Where the arc stands this frame, in Books (0 = the first in front; not wrapped). */
  focus: { value: number }
  /** The dolly's clock (ms, utils/reel/layout.ts `reelCamera`): frozen when the reel doesn't play. */
  dolly: { value: number }
  /** The stage's height (CSS px): the camera's axis is 40 % down it. */
  stageHeight: { value: number }
  /** How a Book comes in and goes out at the arc's edge (utils/reel/edge.ts). */
  edge: { mode: ReelEdge }
  /** How the Books come in once the canvas shows. */
  entrance: ReelEntranceState
  /** How far above the stage's middle the arc's origin stands (CSS px, `--regal-reel-rise`; scene.ts `REEL_RISE`). */
  rise: { value: number }
  /** Called first thing every frame (the card runs the state machine). */
  tick: (ms: number, now: number) => void
  /** A press ended where it began: on Book `index`, or beside every Book (-1). Not while one is out. */
  tap: (index: number) => void
  /** A finger is on the stage: a tap there doesn't count when it caught a moving reel. */
  caught: { value: boolean }
  breakout: ReelBreakout
  /** On screen (or broken out): frames are drawn. */
  visible: Ref<boolean>
  /** How faded the arc is behind a Book taken out (0..1): the veil. */
  dim: { value: number }
  /** The floor shadows' strength: 1 in the light theme, 0 in the dark (--regal-floor-shadow). */
  floorShadow: { value: number }
  /** The veil's colour (the page behind) and opacity broken out. */
  veil: { color: string, opacity: number }
  /** The Book put back goes home at once (Open book). */
  instantReturn: { value: boolean }
  /** A drag turns the Book taken out freely (a trackball) or as the Stage's turntable. */
  rotate: Ref<'free' | 'turntable'>
  /** Reduce Motion: no flight, no dolly; the Book and the sheet appear in place. */
  reduced: Ref<boolean>
  /** A Book's faces from the reel's own Library (never the shared one: ids can collide). */
  facesOf: (bookId: string) => AssetFaces | null
  /** The Books in view wear their faces: the first frame with them is the reel's `ready`. */
  facesReady: { value: boolean }
  /** The first frame with the faces in view was drawn. */
  ready: () => void
}
