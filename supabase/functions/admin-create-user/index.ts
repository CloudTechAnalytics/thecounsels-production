// ============================================================================
// Edge Function: admin-create-user
// Creates a Supabase auth account on behalf of an admin. This is the ONLY way
// accounts are created (public signup is disabled):
//   • Platform Admins create organization admins and CloudTech platform staff.
//   • Organization admins create their firm's users.
//
// Deploy:  supabase functions deploy admin-create-user
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  email: string
  password: string
  fullName: string
  organizationId?: string
  roleKey?: string
  title?: string
  // True only when a Platform Admin is seating an org's first admin as part
  // of creating the organization — keeps that entry out of the org's own
  // audit view (it's a platform action, not something the firm did).
  platformSeed?: boolean
  // Platform staff creation (no organization):
  platform?: boolean
  platformRole?: string
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

  const { email, password, fullName, organizationId, roleKey, title, platform, platformRole, platformSeed } = body
  if (!email || !password || !fullName) {
    return json({ error: 'email, password and fullName are required' }, 400)
  }
  if (!platform && (!organizationId || !roleKey)) {
    return json({ error: 'organizationId and roleKey are required' }, 400)
  }
  if (password.length < 10) return json({ error: 'Password must be at least 10 characters' }, 400)

  // Caller-scoped client — identifies the requester and evaluates RLS helpers.
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: isPlatformAdmin } = await caller.rpc('is_platform_admin')

  if (platform) {
    // Only platform staff may create other platform staff.
    if (!isPlatformAdmin) return json({ error: 'Only platform staff can create platform users' }, 403)
  } else {
    const { data: isOrgAdmin } = await caller.rpc('is_org_admin', { org: organizationId })
    if (!isPlatformAdmin && !isOrgAdmin) {
      return json({ error: 'You are not allowed to create users in this organization' }, 403)
    }
  }

  // Service-role client — privileged operations.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // For firm users, resolve the role id from its key up front.
  let role: { id: string; key: string } | null = null
  if (!platform) {
    const { data, error: roleErr } = await admin.from('roles').select('id, key').eq('key', roleKey).maybeSingle()
    if (roleErr || !data) return json({ error: `Unknown role: ${roleKey}` }, 400)
    role = data
  }

  // Create (or fetch existing) auth user.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  // Track whether *this call* created the account — only a freshly created
  // account should be rolled back below. Never delete a pre-existing user
  // just because a later step failed.
  const isNewUser = !createErr && Boolean(created?.user?.id)

  let userId = created?.user?.id
  if (createErr || !userId) {
    const { data: list } = await admin.auth.admin.listUsers()
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) return json({ error: createErr?.message ?? 'Could not create user' }, 400)
    userId = existing.id
  }

  // `profiles` is populated by an on_auth_user_created trigger the instant the
  // auth user above is created — before this account is seated anywhere. If a
  // later step fails, roll the auth user back (cascades to profiles) instead
  // of leaving an orphaned account with no organization or platform role.
  const rollbackIfNew = async () => {
    if (isNewUser && userId) await admin.auth.admin.deleteUser(userId)
  }

  if (platform) {
    // CloudTech platform staff — no organization membership.
    const { error } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        is_platform_admin: true,
        platform_role: platformRole ?? 'support',
        // Only a freshly created account carries the temp password we just set —
        // an existing account being re-seated keeps whatever password it already has.
        must_change_password: isNewUser,
      })
      .eq('id', userId)
    if (error) {
      await rollbackIfNew()
      return json({ error: error.message }, 400)
    }
    return json({ userId, email }, 201)
  }

  // Firm user — enforce the plan's seat limit before creating anything.
  // The RLS insert policy (memberships_insert, see migration 0054) is the
  // real backstop; this is just a friendlier error than a raw RLS denial.
  {
    const [{ data: sub }, { count: activeCount }] = await Promise.all([
      admin.from('subscriptions').select('seats, plan:plans(name)').eq('organization_id', organizationId).maybeSingle(),
      admin.from('memberships').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active'),
    ])
    const seats = sub?.seats ?? null
    if (seats != null && (activeCount ?? 0) >= seats) {
      await rollbackIfNew()
      const planName = (sub as unknown as { plan?: { name?: string } } | null)?.plan?.name ?? 'current'
      return json({ error: `You've reached the ${seats}-user limit on your ${planName} plan. Upgrade your plan to add more users.` }, 400)
    }
  }

  // Firm user — seat in the organization.
  const isOwnerRole = role!.key === 'managing_partner'
  const { error: memErr } = await admin.from('memberships').upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      role_id: role!.id,
      status: 'active',
      is_owner: isOwnerRole,
      title: title ?? null,
      joined_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,user_id' },
  )
  if (memErr) {
    await rollbackIfNew()
    return json({ error: memErr.message }, 400)
  }

  await admin.from('profiles').update({ full_name: fullName, must_change_password: isNewUser }).eq('id', userId)
  await admin.rpc('log_audit', {
    p_org: organizationId,
    p_action: 'user.created',
    p_entity_type: 'membership',
    p_summary: `Created ${email} as ${role!.key}`,
    p_platform: platformSeed === true,
  })

  return json({ userId, email }, 201)
})
