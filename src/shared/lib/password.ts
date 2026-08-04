// Excludes visually-confusable characters (I/l/1, O/0) since these are meant
// to be read aloud or typed from a screen by whoever's sharing them.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const ALL = UPPER + LOWER + DIGITS

function randomChar(set: string): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return set[arr[0] % set.length]
}

/** A random temporary password satisfying the app's strength rule (10+, upper, lower, digit). */
export function generateTempPassword(length = 14): string {
  const required = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGITS)]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(ALL))
  const chars = [...required, ...rest]

  // Fisher–Yates, so the guaranteed classes aren't always in the first 3 slots.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
