// Where a Book rests in a view (Bookcase Shelf or Stack), in world metres.
// Views produce poses; the Book meshes and the Pick controller consume them.

export interface BookPose {
  bookId: string
  /** Centre of the Book. */
  x: number
  y: number
  z: number
  /** Euler XYZ, radians. The Spine is the Book's local +z face. */
  rotation: [number, number, number]
  /** Spine thickness (local x), height (local y), depth front-to-back (local z). */
  thickness: number
  height: number
  depth: number
  /** Deterministic cloth colour, used until the Cover has loaded. */
  color: string
  /** Section the Book belongs to (its Reading status). */
  section: string
}
