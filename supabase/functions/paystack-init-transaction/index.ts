// ============================================================================
// Edge Function: paystack-init-transaction
// Starts a Paystack checkout for an organization's chosen plan — "Subscribe
// Now" from onboarding, or "Upgrade plan" from Plan & Billing. Never marks a
// subscription active itself; that only happens once paystack-webhook
// verifies the payment server-side (see that function).
//
// Deploy:  supabase functions deploy paystack-init-transaction
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
const VALID_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly']

interface Payload {
  organizationId: string
  planId: string
  /** Where Paystack sends the browser back to after checkout. */
  callbackUrl: string
  /** Defaults to 'monthly' so any caller still on the old two-arg shape keeps working unchanged. */
  billingCycle?: BillingCycle
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { organizationId, planId, callbackUrl } = body
  if (!organizationId || !planId || !callbackUrl) {
    return json({ error: 'organizationId, planId and callbackUrl are required' }, 400)
  }
  const billingCycle: BillingCycle = VALID_CYCLES.includes(body.billingCycle as BillingCycle)
    ? (body.billingCycle as BillingCycle)
    : 'monthly'

  // Never a fake success — build the complete flow, but be honest when the
  // real integration hasn't been configured yet.
  if (!PAYSTACK_SECRET_KEY) {
    return json({ error: 'Payment integration is not configured.' }, 400)
  }

  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: canManage } = await caller.rpc('has_permission', { org: organizationId, perm: 'organization.manage' })
  if (!canManage) return json({ error: 'You are not allowed to manage billing for this organization' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  const [{ data: org }, { data: plan }, { data: profile }] = await Promise.all([
    admin.from('organizations').select('id, name, billing_email').eq('id', organizationId).single(),
    admin.from('plans').select('*').eq('id', planId).single(),
    admin.from('profiles').select('email').eq('id', userData.user.id).single(),
  ])
  if (!org) return json({ error: 'Organization not found' }, 404)
  if (!plan) return json({ error: 'Plan not found' }, 404)
  if (plan.is_custom) return json({ error: 'Enterprise pricing is custom — contact sales instead of checkout.' }, 400)

  const email = org.billing_email || profile?.email
  if (!email) return json({ error: 'No billing email on file for this organization' }, 400)

  const cyclePrice: Record<BillingCycle, unknown> = {
    monthly: plan.price_monthly,
    quarterly: plan.price_quarterly,
    yearly: plan.price_yearly,
  }
  const price = cyclePrice[billingCycle]
  if (price == null) {
    return json({ error: `This plan has no ${billingCycle} price set — contact support.` }, 400)
  }

  const paystackBody: Record<string, unknown> = {
    email,
    amount: Math.round(Number(price) * 100), // kobo
    currency: plan.currency ?? 'NGN',
    callback_url: callbackUrl,
    metadata: { organization_id: organizationId, plan_id: planId, billing_cycle: billingCycle },
  }
  if (plan.paystack_plan_code) paystackBody.plan = plan.paystack_plan_code

  const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(paystackBody),
  })
  const psData = await psRes.json()
  if (!psRes.ok || !psData?.status) {
    return json({ error: psData?.message ?? 'Paystack could not start this transaction' }, 400)
  }

  // Record the pending reference (so the webhook can match its callback back
  // to this org) and the chosen cycle (so paystack-webhook's next_billing_date
  // math — which reads billing_cycle off this same row — uses the cycle just
  // paid for, not whatever it was set to before this checkout started).
  // Neither touches status; only a verified webhook does that.
  await admin
    .from('subscriptions')
    .update({ paystack_transaction_reference: psData.data.reference, billing_cycle: billingCycle })
    .eq('organization_id', organizationId)

  return json({ authorizationUrl: psData.data.authorization_url, reference: psData.data.reference })
})
