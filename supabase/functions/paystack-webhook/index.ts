// ============================================================================
// Edge Function: paystack-webhook
// Public endpoint Paystack calls directly (no user session) — this is the
// ONLY place a subscription is ever marked 'active'/'past_due'/'cancelled'.
// The frontend's checkout callback page only ever reflects what this
// function has already written; it never marks anything itself.
//
// Deploy:  supabase functions deploy paystack-webhook --no-verify-jwt
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_...
// Register this function's URL as the webhook URL in the Paystack dashboard.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === signature
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!PAYSTACK_SECRET_KEY) return json({ error: 'Payment integration is not configured.' }, 400)

  // Must verify against the exact raw bytes Paystack signed — read as text
  // before any parsing, never re-serialize and compare against that instead.
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  if (!(await verifySignature(rawBody, signature, PAYSTACK_SECRET_KEY))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: { event: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  const data = event.data as {
    reference?: string
    amount?: number
    customer?: { customer_code?: string }
    plan?: { plan_code?: string }
    subscription_code?: string
    metadata?: { organization_id?: string; plan_id?: string }
    next_payment_date?: string
  }

  const organizationId = data.metadata?.organization_id
  const reference = data.reference

  // Match by whichever identifier is present — metadata survives on the
  // original charge; later subscription lifecycle events carry the
  // subscription_code but usually still echo the same reference.
  const matchOrg = async () => {
    if (organizationId) return organizationId
    if (!reference) return null
    const { data: sub } = await admin
      .from('subscriptions')
      .select('organization_id')
      .eq('paystack_transaction_reference', reference)
      .maybeSingle()
    return sub?.organization_id ?? null
  }

  switch (event.event) {
    case 'charge.success':
    case 'subscription.create': {
      const orgId = await matchOrg()
      if (!orgId) break
      const nextBilling = data.next_payment_date ? new Date(data.next_payment_date).toISOString() : null

      // Seats must move together with plan_id — the seat limit shown/
      // enforced elsewhere (members-panel.tsx, can_add_member() RLS,
      // admin-create-user) reads subscriptions.seats directly, so an
      // upgrade that only changed plan_id would leave the org capped at
      // its old plan's seat count. null max_users (unlimited) correctly
      // produces seats = null, same "no limit" meaning used everywhere
      // else.
      let seats: number | null | undefined
      if (data.metadata?.plan_id) {
        const { data: plan } = await admin
          .from('plans')
          .select('max_users')
          .eq('id', data.metadata.plan_id)
          .maybeSingle()
        seats = plan?.max_users ?? null
      }

      await admin
        .from('subscriptions')
        .update({
          status: 'active',
          // metadata.plan_id is always the plan being paid for — this is what
          // makes an upgrade (re-checkout at the new plan's price) actually
          // switch the org onto that plan once payment is confirmed here,
          // not just re-activate whatever plan_id it already had.
          plan_id: data.metadata?.plan_id ?? undefined,
          seats,
          paystack_customer_code: data.customer?.customer_code ?? undefined,
          paystack_subscription_code: data.subscription_code ?? data.plan?.plan_code ?? undefined,
          amount: data.amount != null ? data.amount / 100 : undefined,
          next_billing_date: nextBilling,
          current_period_end: nextBilling,
        })
        .eq('organization_id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.activated', p_entity_type: 'subscription',
        p_summary: 'Subscription activated via Paystack', p_platform: false,
      })
      break
    }
    case 'invoice.payment_failed': {
      const orgId = await matchOrg()
      if (!orgId) break
      await admin.from('subscriptions').update({ status: 'past_due' }).eq('organization_id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.payment_failed', p_entity_type: 'subscription',
        p_summary: 'A Paystack payment attempt failed', p_platform: false,
      })
      break
    }
    case 'subscription.disable': {
      const orgId = await matchOrg()
      if (!orgId) break
      await admin
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('organization_id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.cancelled', p_entity_type: 'subscription',
        p_summary: 'Subscription cancelled via Paystack', p_platform: false,
      })
      break
    }
    default:
      // Every other event type is acknowledged but ignored.
      break
  }

  return json({ received: true })
})
