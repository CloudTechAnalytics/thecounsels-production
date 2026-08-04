// ============================================================================
// Edge Function: hard-delete-organization
// Permanently removes an already-trashed organization. This is the ONLY path
// that should ever be used for the "Delete forever" action:
//   • hard_delete_organization (SQL RPC) can't reach auth.users — that schema
//     is owned by supabase_auth_admin, not the migrations role — so account
//     cleanup happens here, via the service-role Auth Admin API, exactly like
//     admin-create-user's own rollback already does.
//   • Only after accounts are purged do we call the RPC to remove the org row
//     itself, which cascades through every org-scoped table.
//
// Deploy:  supabase functions deploy hard-delete-organization
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  organizationId: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { organizationId } = body
  if (!organizationId) return json({ error: 'organizationId is required' }, 400)

  // Caller-scoped client — identifies the requester and evaluates RLS helpers.
  // The RPC at the end re-checks is_platform_admin() itself, but failing
  // fast here avoids purging anyone's account on an unauthorized request.
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: isPlatformAdmin } = await caller.rpc('is_platform_admin')
  if (!isPlatformAdmin) return json({ error: 'Only a platform administrator can delete organizations' }, 403)

  // Service-role client — privileged operations (reading across RLS, Auth Admin API).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, deleted_at')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgErr) return json({ error: orgErr.message }, 400)
  if (!org) return json({ error: 'Organization not found' }, 404)
  if (!org.deleted_at) {
    return json({ error: 'Move the organization to Trash before deleting it permanently' }, 400)
  }

  // Accounts that exist only for this org (never touching platform staff or
  // anyone who also belongs to another organization) get purged via the Auth
  // Admin API — the only reliable way to remove an auth.users row. profiles.id
  // cascades from auth.users, so this takes memberships/staff data/etc. with it.
  const { data: orgMembers, error: memberErr } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
  if (memberErr) return json({ error: memberErr.message }, 400)

  const memberIds = [...new Set((orgMembers ?? []).map((m) => m.user_id))]
  let purged = 0
  const failed: string[] = []

  if (memberIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, is_platform_admin').in('id', memberIds)
    const { data: allMemberships } = await admin.from('memberships').select('user_id, organization_id').in('user_id', memberIds)

    const exclusiveIds = memberIds.filter((id) => {
      if (profiles?.find((p) => p.id === id)?.is_platform_admin) return false
      return !allMemberships?.some((m) => m.user_id === id && m.organization_id !== organizationId)
    })

    for (const userId of exclusiveIds) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) failed.push(userId)
      else purged += 1
    }
  }

  // Anyone left (platform staff, or a member of another org too) simply loses
  // this membership — it cascades away with the org row below.
  const { error: rpcErr } = await caller.rpc('hard_delete_organization', { p_org: organizationId })
  if (rpcErr) return json({ error: rpcErr.message }, 400)

  // Log against organization_id = null so this platform-level record survives
  // the org row it's about — a log tied to the now-deleted org would cascade
  // away with it. Uses the caller's own JWT so actor_id attributes correctly.
  await caller.rpc('log_audit', {
    p_org: null,
    p_action: 'organization.hard_deleted',
    p_entity_type: 'organization',
    p_entity_id: organizationId,
    p_summary: `Permanently deleted ${org.name}`,
    p_metadata: { purgedAccounts: purged, failedAccounts: failed.length },
    p_platform: true,
  })

  if (failed.length > 0) {
    return json({
      organizationId,
      purgedAccounts: purged,
      warning: `Organization deleted, but ${failed.length} account(s) couldn't be removed and may need manual cleanup.`,
    })
  }

  return json({ organizationId, purgedAccounts: purged })
})
