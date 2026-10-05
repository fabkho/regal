// Design round (horizontal Stack): what the round found, shown on the compare
// page (/prototype/row). Numbers from scripts/prototype/row-measure.mjs: a
// 360 × 300 card on a 412 × 915 phone profile at DPR 2.625, CPU throttled 4×,
// the mobile render tier, the published shelf (77 Books, repeated to 100).
// The GPU was the dev machine's (Apple M5 Pro via ANGLE/Metal), so frame
// times show main-thread cost; a phone GPU is slower.
import type { RowVariantKey } from './layout'

export interface RowFinding {
  facts: { label: string, value: string }[]
  good: string[]
  bad: string[]
}

export const ROW_FINDINGS: Record<Exclude<RowVariantKey, 's'>, RowFinding> = {
  a: {
    facts: [
      { label: 'In a 360 card', value: '≈ 13 Books' },
      { label: 'Row, 100 Books', value: '3 490 px (≈ 10 card widths)' },
      { label: 'Frame work p95', value: '5.5 ms (4× CPU), no dropped frames' },
      { label: 'Textures, 100', value: '≈ 39 MB (Spines, page edges)' },
      { label: 'Draw calls', value: '≈ 210 (with shadow)' },
    ],
    good: [
      'Densest: the most Books per card, the shortest row for 100.',
      'Shows the Spine art the pipeline made; reads as Regal\'s Bookcase.',
      'Index tabs between months read at a glance; the year only where it changes.',
      'Cheapest on memory: fronts load only when a Book is taken out.',
    ],
    bad: [
      'Thin Books are thin tap targets (a 120-page paperback ≈ 9 px); the prototype lets a tap that misses take the nearest Spine within 18 px.',
      'Spine titles run vertically: readable, not skimmable.',
      'Months with one Book crowd their tabs; some dates drop out.',
    ],
  },
  b: {
    facts: [
      { label: 'In a 360 card', value: '≈ 2½ piles (months)' },
      { label: 'Row, 100 Books', value: '8 080 px (≈ 22 card widths)' },
      { label: 'Frame work p95', value: '4.7 ms (4× CPU), no dropped frames' },
      { label: 'Textures, 100', value: '≈ 63 MB (pile tops show their front)' },
      { label: 'Draw calls', value: '≈ 100' },
    ],
    good: [
      'Keeps the Stack\'s look: flat Books, titles reading left to right, the riffle.',
      'One pile per month makes the timeline explicit (a year in review is 12 piles).',
      'Each pile\'s top Book shows its Cover.',
    ],
    bad: [
      'Least dense: a flat Book is as wide as it is tall; most of the card is paper.',
      'Longest row (2.3× the standing row); 100 Books is a long swipe.',
      'Spines are ~14 px tall in a phone card: small type, thin tap targets.',
    ],
  },
  c: {
    facts: [
      { label: 'In a 360 card', value: '≈ 5 Books' },
      { label: 'Row, 100 Books', value: '5 320 px (≈ 15 card widths)' },
      { label: 'Frame work p95', value: '4.3 ms (4× CPU), no dropped frames' },
      { label: 'Textures, 100', value: '≈ 130 MB (every front, Spines)' },
      { label: 'Draw calls', value: '≈ 130' },
    ],
    good: [
      'The most inviting: Covers are what people recognise; it feels like flipping through records.',
      'Focus follows the finger or mouse; big tap targets (≈ 45 px per Book).',
      'A Book turning to face you previews the Pick before the tap.',
    ],
    bad: [
      'Heaviest: every front loads (3× the standing row\'s textures at 100 Books).',
      'The Spine art is mostly hidden; covers overlap by half.',
      'The parting neighbours make the row move under a resting finger.',
    ],
  },
}

export const ROW_RECOMMENDATION = [
  'Build (a), the standing row, as the layer component, and keep (c) as its second look. (a) fits the most Books into a card, has the shortest row for 100 and the smallest memory, and it is Regal: the Spine art and the Bookcase it came from. (c) is the better-looking card for a short list (a year in review of 30–50 Books), where its cost and length don\'t matter. Both share everything but their layout and focus look, so a `variant` prop costs little. (b) is the Stack\'s identity but the wrong shape for a row: flat Books waste most of a card.',
  'Before shipping (a): keep the tap that takes the nearest Spine within a finger\'s width (in the prototype), and let a long row (Profile, 60–100 Books) label years, not months, when months are short.',
  'As a layer component: `RegalBooksRow` (not a prop on RegalBooksStage, whose page-filling Stack, sheet and global Pick are a different contract), props `variant: \'shelf\' | \'fan\'`, `limit`, `year`, `order`, its own Pick scope, native horizontal scroll, HTML labels, the picked Book inspected inside the card. The fork of Meshes.vue (prototype/RowBooks.vue) folds back into Meshes.vue as an axis and a focus-look strategy. Estimate: 3–4 days for the shared base with tests, ½ day for (a), 1 day for (c).',
]
