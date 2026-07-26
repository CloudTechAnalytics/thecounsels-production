import { supabase } from '@/shared/lib/supabase'
import { env } from '@/shared/config/env'

export type ServiceStatus = 'operational' | 'degraded' | 'down'

export interface ServiceCheck {
  key: string
  label: string
  description: string
  status: ServiceStatus
  latencyMs: number | null
}

export interface HealthReport {
  checks: ServiceCheck[]
  checkedAt: string
}

const DEGRADED_MS = 1500

function grade(ok: boolean, ms: number): { status: ServiceStatus; latencyMs: number } {
  if (!ok) return { status: 'down', latencyMs: ms }
  return { status: ms > DEGRADED_MS ? 'degraded' : 'operational', latencyMs: Math.round(ms) }
}

/** Time an async probe; any resolved value counts, throw = down. */
async function timed(probe: () => Promise<void>): Promise<{ status: ServiceStatus; latencyMs: number | null }> {
  const start = performance.now()
  try {
    await probe()
    return grade(true, performance.now() - start)
  } catch {
    return { status: 'down', latencyMs: null }
  }
}

/** An HTTP response — even 4xx — proves the service is up; only network errors/5xx are failures. */
async function probeHttp(url: string): Promise<void> {
  const res = await fetch(url, { headers: { apikey: env.supabaseAnonKey } })
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
}

function probeRealtime(): Promise<void> {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(`health-${Date.now()}`)
    const timer = setTimeout(() => {
      supabase.removeChannel(channel)
      reject(new Error('timeout'))
    }, 5000)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        supabase.removeChannel(channel)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        supabase.removeChannel(channel)
        reject(new Error(status))
      }
    })
  })
}

export const healthService = {
  /** Live round-trip checks against every Supabase surface the app depends on. */
  async runChecks(): Promise<HealthReport> {
    const base = env.supabaseUrl
    const [db, auth, storage, realtime, functions] = await Promise.all([
      timed(async () => {
        const { error } = await supabase
          .from('organizations')
          .select('id', { count: 'exact', head: true })
          .limit(1)
        if (error) throw error
      }),
      timed(() => probeHttp(`${base}/auth/v1/health`)),
      timed(() => probeHttp(`${base}/storage/v1/bucket`)),
      timed(() => probeRealtime()),
      timed(async () => {
        const res = await fetch(`${base}/functions/v1/admin-create-user`, { method: 'OPTIONS' })
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
      }),
    ])

    const checks: ServiceCheck[] = [
      { key: 'database', label: 'Database & REST API', description: 'PostgreSQL via PostgREST — all app data', ...db },
      { key: 'auth', label: 'Authentication', description: 'Sign-in, sessions and JWT issuing', ...auth },
      { key: 'storage', label: 'File Storage', description: 'Documents, avatars and firm logos', ...storage },
      { key: 'realtime', label: 'Realtime', description: 'Live activity feeds over WebSocket', ...realtime },
      { key: 'functions', label: 'Edge Functions', description: 'admin-create-user (account provisioning)', ...functions },
    ]

    return { checks, checkedAt: new Date().toISOString() }
  },
}
