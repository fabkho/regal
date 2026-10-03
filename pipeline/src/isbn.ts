// ISBN helpers the front lookup needs (moved out of the Goodreads matcher,
// which stays with the frozen build on main).

/** ISBN-13 of an ISBN-10 or ISBN-13 (hyphens and spaces ignored); null for anything else. */
export function toIsbn13(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[^0-9X]/gi, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(digits)) return digits
  if (!/^\d{9}[\dX]$/.test(digits)) return null
  const body = `978${digits.slice(0, 9)}`
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  return `${body}${(10 - (sum % 10)) % 10}`
}
