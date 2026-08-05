/** Permissive phone-format check — digits, spaces, `+`, `-`, parentheses,
 * 7–20 characters. Catches obviously-wrong input (letters, 3-digit numbers)
 * without needing real per-country dialing-plan knowledge. */
const PHONE_PATTERN = /^[+\d][\d\s\-()]{6,19}$/

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.trim())
}
