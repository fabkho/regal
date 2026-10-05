export interface InspectInsets {
  /** Stage px covered over the 3D at the top (the controls' band, or the viewport's top edge). */
  top: number
  /** Stage px covered at the bottom (the details sheet, or the viewport's bottom edge). */
  bottom: number
  /**
   * Where the details sheet's top edge rests on a phone, in viewport px (it
   * sits on the viewport's bottom edge, over whatever the host has under the
   * stage); null while there is none. The stage turns it into `bottom`.
   */
  sheetTop: number | null
}

/**
 * How much of the stage is covered over the 3D, so the picked Book floats in
 * the band between (utils/books/inspect.ts). Zero where nothing covers it
 * (the card on wide stages keeps its own aside move).
 */
export function useInspectInsets() {
  return useState<InspectInsets>('books:inspect-insets', () => ({ top: 0, bottom: 0, sheetTop: null }))
}
