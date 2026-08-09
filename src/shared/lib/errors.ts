/**
 * Extracts a human-readable message from any thrown value.
 *
 * Supabase/PostgREST errors are plain objects (`{ message, details, hint,
 * code }`) — they do NOT extend `Error`, so the codebase-wide
 * `err instanceof Error ? err.message : undefined` pattern silently drops
 * their message and falls back to nothing. This checks for a string
 * `.message` property on anything, not just real Error instances.
 */
export function errorMessage(err: unknown, fallback?: string): string | undefined {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

/** Races a promise against a timeout so a hung network call never blocks the UI forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'The request timed out.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}
