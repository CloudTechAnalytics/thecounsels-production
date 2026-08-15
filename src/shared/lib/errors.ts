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

/**
 * Same as errorMessage(), but translates the raw Postgres RLS-violation
 * text ("new row violates row-level security policy for table X") into
 * something a user can actually act on — that message names an internal
 * table, not a reason. Anywhere a create/update can be blocked by a
 * closed-matter or similar access rule (not just a missing permission)
 * should use this instead of errorMessage() directly.
 */
export function friendlyErrorMessage(err: unknown, fallback?: string): string | undefined {
  const raw = errorMessage(err, fallback)
  if (raw?.includes('row-level security')) {
    return "You don't have permission to do this — the matter may be closed, or you may not have access to it."
  }
  return raw
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
