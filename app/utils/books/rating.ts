// A Book's rating as a number beside its quarter stars (the tooltip, the
// focus labels, the detail panel): at 0.65 rem a quarter star is hard to
// tell, the figure isn't. Pure, so it's unit-testable.

/** The rating as it is written: two decimals only when needed (4.25, 4.5, 4). */
export function ratingText(rating: number): string {
  return String(Math.round(rating * 100) / 100)
}

/** The rating in words, for assistive tech instead of the drawn stars: "4.25 of 5 stars". */
export function ratingStarsText(rating: number): string {
  return `${ratingText(rating)} of 5 stars`
}
