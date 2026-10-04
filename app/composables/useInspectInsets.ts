/**
 * How much of the stage (px) is covered over the 3D at the top (the controls'
 * band) and the bottom (the details sheet on a phone), so the picked Book
 * floats in the band between them (utils/books/inspect.ts). Zero where nothing
 * covers it (the card on wide stages keeps its own aside move).
 */
export function useInspectInsets() {
  return useState('books:inspect-insets', () => ({ top: 0, bottom: 0 }))
}
