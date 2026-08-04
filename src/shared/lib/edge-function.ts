import { supabase } from '@/shared/lib/supabase'

/**
 * Invoke a Supabase Edge Function, surfacing its JSON `{ error }` body (on a
 * non-2xx response, or in an otherwise-2xx payload) as a normal Error instead
 * of the generic "Edge Function returned a non-2xx status code".
 */
export async function invokeEdgeFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      let message: string | undefined
      try {
        const payload = await ctx.json()
        message = payload?.error
      } catch {
        /* response body wasn't JSON — fall back to the generic error below */
      }
      if (message) throw new Error(message)
    }
    throw error
  }
  const payload = data as { error?: string } | null
  if (payload?.error) throw new Error(payload.error)
  return data as T
}
