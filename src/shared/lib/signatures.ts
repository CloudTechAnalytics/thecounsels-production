import { supabase } from '@/shared/lib/supabase'

/** Signatures (data URLs) for the given people — colleagues in a shared firm
 * only (RLS, 0190). People without one are simply absent from the map. */
export async function getSignatures(userIds: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((u): u is string => Boolean(u)))]
  if (ids.length === 0) return {}
  const { data } = await supabase.from('user_signatures').select('user_id, image').in('user_id', ids)
  return Object.fromEntries((data ?? []).map((r) => [r.user_id, r.image]))
}

/** Opens the print window straight away, inside the click, so pop-up
 * blockers allow it; the document is written in once its data has loaded. */
export function openBlankPrintWindow(): Window | null {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (w) {
    w.document.write('<!doctype html><title>Preparing…</title><body style="font-family:Arial,sans-serif;color:#78716c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Preparing your document…</body>')
    w.document.close()
  }
  return w
}
