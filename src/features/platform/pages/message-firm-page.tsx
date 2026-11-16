import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Crown, Mail, Plus, Send, X } from 'lucide-react'
import { usePlatformOrganizations } from '@/features/platform/hooks/use-platform'
import { useFirmRecipients, useMessageFirm } from '@/features/support/hooks/use-support'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Sign-offs: the welcome comes from John personally; trial reminders from the team.
const SIGN_FOUNDER = 'Best regards,\nJohn Adeleke\nFounder, The Counsel'
const SIGN_TEAM = 'Best regards,\nThe Counsel Team'

type Template = { key: string; label: string; subject: (firm: string) => string; body: (firm: string, trialEnd: string | null) => string }
const TEMPLATES: Template[] = [
  {
    key: 'trial-ending', label: 'Trial ending',
    subject: (f) => `Your free trial of The Counsel${f ? ` for ${f}` : ''} is ending`,
    body: (f, end) => `Thank you for trying The Counsel with ${f}.\n\nYour free trial ${end ? `ends on ${end}` : 'is ending soon'}. To keep your matters, court dates, documents and billing running without a break, you can choose a plan from Firm Settings → Plan & Billing.\n\nIf you'd like more time to try things, or a quick walkthrough for your team, just reply here and we'll sort it out.

${SIGN_TEAM}`,
  },
  {
    key: 'trial-ended', label: 'Trial ended',
    subject: () => 'Your trial of The Counsel has ended — your data is safe',
    body: (f, end) => `Your free trial for ${f}${end ? ` ended on ${end}` : ' has ended'}. Everything your team added is safe and waiting for you.\n\nTo carry on, choose a plan from Firm Settings → Plan & Billing. If something held you back, or you need a few more days, reply here and tell us. We're happy to help.

${SIGN_TEAM}`,
  },
  {
    key: 'welcome', label: 'Welcome',
    subject: () => 'Welcome to The Counsel',
    body: (f) => `Welcome to The Counsel, and thank you for setting up ${f}.\n\nA good first step is to add your team, then your active matters and their next court dates, so everyone gets reminders before each hearing.\n\nIf you'd like, I can walk your team through it in 15 minutes. Just reply here with a time that suits you.

${SIGN_FOUNDER}`,
  },
]

/** Platform Console → a firm → "Message this firm": choose who gets it, write
 * it (or start from a template), send. It is emailed in The Counsel's design
 * and opens a conversation the firm can answer in the app. */
export function MessageFirmPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: orgs = [], isLoading: orgsLoading } = usePlatformOrganizations()
  const org = orgs.find((o) => o.id === id)
  const { data: people = [], isLoading } = useFirmRecipients(id)
  const send = useMessageFirm()

  const [chosen, setChosen] = React.useState<Set<string>>(new Set())
  const [extra, setExtra] = React.useState<string[]>([])
  const [extraInput, setExtraInput] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [template, setTemplate] = React.useState<string | null>(null)

  // Start with the owner ticked — usually who you mean.
  React.useEffect(() => {
    if (people.length && chosen.size === 0) {
      const owner = people.find((p) => p.is_owner)
      if (owner) setChosen(new Set([owner.user_id]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length])

  if (orgsLoading) return <Skeleton className="h-96 w-full" />
  if (!org) return <Card className="p-10 text-center text-muted-foreground">Organization not found.</Card>

  const trialEnd = org.subscription?.trial_ends_at ? format(new Date(org.subscription.trial_ends_at), 'd MMMM yyyy') : null
  const toggle = (uid: string) => setChosen((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  const allOn = people.length > 0 && people.every((p) => chosen.has(p.user_id))
  const addExtra = () => {
    const parts = extraInput.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
    const bad = parts.filter((p) => !EMAIL_RE.test(p))
    if (bad.length) { toast.error('Not a valid email', { description: bad.join(', ') }); return }
    setExtra((e) => [...new Set([...e, ...parts.filter((p) => !people.some((x) => x.email.toLowerCase() === p))])])
    setExtraInput('')
  }
  const applyTemplate = (t: Template) => {
    setTemplate(t.key)
    setSubject(t.subject(org.name))
    setBody(t.body(org.name, trialEnd))
  }
  const total = chosen.size + extra.length

  const submit = async () => {
    if (total === 0) { toast.error('Choose at least one person'); return }
    if (!subject.trim() || !body.trim()) { toast.error('Add a subject and a message'); return }
    try {
      const res = await send.mutateAsync({ organizationId: org.id, subject, body, recipients: [...chosen], extraEmails: extra })
      const e = res.email
      if (e?.ok) toast.success(`Sent to ${e.sent?.length ?? total} ${e.sent?.length === 1 ? 'person' : 'people'}`, { description: 'Their replies will appear in this conversation.' })
      else toast.warning('Saved in the app, but the email did not go to everyone', { description: e?.failed?.map((f) => `${f.to}: ${f.error}`).join('; ') || e?.error })
      navigate(`/platform/conversations/${res.id}`)
    } catch (err) { toast.error('Could not send', { description: errorMessage(err) }) }
  }

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate(`/platform/organizations/${org.id}`)}><ArrowLeft className="h-4 w-4" /> {org.name}</Button>
      <PageHeader title={`Message ${org.name}`} description="Emailed in The Counsel's design. They can reply in the app (even if their trial has ended) or by email, and replies come back here." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Send to <span className="font-normal text-muted-foreground">({total} selected)</span></p>
            {people.length > 1 && (
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setChosen(allOn ? new Set() : new Set(people.map((p) => p.user_id)))}>
                {allOn ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
          {isLoading ? <Skeleton className="h-32 w-full" /> : people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active members with an email. Add an address below.</p>
          ) : (
            <ul className="space-y-1">
              {people.map((p) => (
                <li key={p.user_id}>
                  <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60', chosen.has(p.user_id) && 'bg-primary/5')}>
                    <input type="checkbox" checked={chosen.has(p.user_id)} onChange={() => toggle(p.user_id)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {p.full_name ?? p.email}
                        {p.is_owner && <Crown className="h-3.5 w-3.5 text-primary" aria-label="Owner" />}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                      {p.role && <span className="block text-xs text-muted-foreground">{p.role}{p.is_owner ? ' · Owner' : ''}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <Label className="text-xs">Another email address</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={extraInput} onChange={(e) => setExtraInput(e.target.value)} placeholder="e.g. info@firm.com"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }} />
              <Button type="button" variant="outline" size="icon" onClick={addExtra} aria-label="Add email"><Plus className="h-4 w-4" /></Button>
            </div>
            {extra.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {extra.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1 font-normal">
                    <Mail className="h-3 w-3" />{e}
                    <button type="button" onClick={() => setExtra((x) => x.filter((y) => y !== e))} aria-label={`Remove ${e}`}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">People outside the workspace get the email and can reply to it; only members can reply in the app.</p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start from</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button key={t.key} type="button" size="sm" variant={template === t.key ? 'default' : 'outline'} onClick={() => applyTemplate(t)}>{t.label}</Button>
              ))}
              <Button type="button" size="sm" variant={template === null && (subject || body) ? 'default' : 'ghost'} onClick={() => { setTemplate(null); setSubject(''); setBody('') }}>Blank</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your free trial is ending" />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={11} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
            <p className="text-xs text-muted-foreground">Each person is greeted by their first name automatically (“Hello Bola,”), so start straight with the message. Leave a blank line between paragraphs.</p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => navigate(`/platform/organizations/${org.id}`)}>Cancel</Button>
            <Button onClick={submit} loading={send.isPending} disabled={total === 0}><Send className="h-4 w-4" /> Send to {total || '…'}</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
