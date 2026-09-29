// EAN-13 barcode encoding (ISBN-13s are EAN-13s). Pure.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** True when the 13 digits carry a valid EAN-13 check digit. */
export function isValidEan13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false
  const sum = [...digits.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(digits[12])
}

/**
 * The 95 modules of an EAN-13 barcode as a '0'/'1' string ('1' = bar), or null
 * for anything that isn't a valid 13-digit EAN.
 */
export function ean13Modules(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!isValidEan13(digits)) return null
  const parity = PARITY[Number(digits[0])]!
  let left = ''
  for (let i = 1; i <= 6; i++) {
    const d = Number(digits[i])
    left += parity[i - 1] === 'L' ? L[d] : G[d]
  }
  let right = ''
  for (let i = 7; i <= 12; i++) right += R[Number(digits[i])]
  return `101${left}01010${right}101`
}
