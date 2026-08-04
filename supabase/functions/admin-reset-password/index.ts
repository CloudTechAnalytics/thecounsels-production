// ============================================================================
// Edge Function: admin-reset-password
// Sets a new temporary password for an existing account, bypassing email
// entirely — the admin communicates it to the user out-of-band. The account
// is flagged must_change_password so they're forced to set their own on
// next sign-in, exactly like a freshly admin-created account.
//
//   • Platform Admins can reset any account: platform staff, or (with an
//     organizationId) any firm's user.
//   • Organization admins can reset accounts within their own org only.
//
// Deploy:  supabase functions deploy admin-reset-password
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  userId: string
  newPassword: string
  // Omit when resetting a platform staff account; required for a firm user.
  organizationId?: string
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

  const { userId, newPassword, organizationId } = body
  if (!userId || !newPassword) return json({ error: 'userId and newPassword are required' }, 400)
  if (newPassword.length < 10) return json({ error: 'Password must be at least 10 characters' }, 400)

  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: isPlatformAdmin } = await caller.rpc('is_platform_admin')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (organizationId) {
    // Resetting a firm user's password.
    const { data: isOrgAdmin } = await caller.rpc('is_org_admin', { org: organizationId })
    if (!isPlatformAdmin && !isOrgAdmin) {
      return json({ error: 'You are not allowed to reset passwords in this organization' }, 403)
    }
    const { data: membership } = await admin
      .from('memberships')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership) return json({ error: 'That user is not a member of this organization' }, 404)
  } else {
    // Resetting a platform staff account — platform admins only.
    if (!isPlatformAdmin) return json({ error: 'Only a platform administrator can do that' }, 403)
    const { data: target } = await admin.from('profiles').select('is_platform_admin').eq('id', userId).maybeSingle()
    if (!target?.is_platform_admin) return json({ error: 'That account is not platform staff' }, 404)
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (pwErr) return json({ error: pwErr.message }, 400)

  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)

  await caller.rpc('log_audit', {
    p_org: organizationId ?? null,
    p_action: 'user.password_reset',
    p_entity_type: 'profile',
    p_entity_id: userId,
    p_summary: 'Password reset by an administrator',
    p_metadata: {},
    p_platform: !organizationId,
  })

  return json({ userId }, 200)
})
