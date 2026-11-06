import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Paperclip, BellRing, CheckCircle2, Trash2, PenLine, Download } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  openCircularAttachment, useAcknowledgeCircular, useCircular, useCircularRecipients, useDeleteCircular,
  useMarkCircularRead, useRemindCircular,
} from '@/features/hr/hooks/use-circulars'
import { supabase } from '@/shared/lib/supabase'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const fmt = (d: string | null) => (d ? format(new Date(d), 'd MMM yyyy, h:mm a') : '—')

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CircularDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('hr_announcements.manage')
  const { data: c, isLoading } = useCircular(id)
  const { data: recipients = [] } = useCircularRecipients(id, true)
  const markRead = useMarkCircularRead()
  const ack = useAcknowledgeCircular()
  const remind = useRemindCircular()
  const del = useDeleteCircular()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [sign, setSign] = React.useState(true)
  const { data: hasSignature } = useQuery({
    queryKey: ['my-signature-exists', userId],
    enabled: Boolean(userId),
    queryFn: async () => Boolean((await supabase.from('user_signatures').select('user_id').eq('user_id', userId!).maybeSingle()).data),
  })

  const mine = recipients.find((r) => r.user_id === userId)
  // Opening it counts as reading it.
  const marked = React.useRef(false)
  React.useEffect(() => {
    if (c && mine && !mine.read_at && !marked.current) { marked.current = true; markRead.mutate(c.id) }
  }, [c, mine, markRead])

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!c) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium">Circular not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or it wasn't sent to you.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/hr/announcements">Back to circulars</Link></Button>
      </Card>
    )
  }

  const done = recipients.filter((r) => (c.requires_ack ? r.acknowledged_at : r.read_at))
  const outstanding = recipients.filter((r) => !(c.requires_ack ? r.acknowledged_at : r.read_at))
  const runAck = async () => {
    try { await ack.mutateAsync({ id: c.id, withSignature: sign && Boolean(hasSignature) }); toast.success('Thank you — acknowledgement recorded') }
    catch (err) { toast.error('Could not record acknowledgement', { description: errorMessage(err) }) }
  }

  return (
    <div className="w-full max-w-5xl">
      <Link to="/hr/announcements" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Circulars
      </Link>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-primary" />
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{c.reference_no}{c.category ? ` · ${c.category}` : ''}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{c.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(new Date(c.created_at), 'EEEE d MMMM yyyy')}
                {c.requires_ack && c.ack_due ? ` · acknowledge by ${format(new Date(c.ack_due + 'T00:00:00'), 'd MMMM yyyy')}` : ''}
              </p>
            </div>
            {canManage && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete</Button>
            )}
          </div>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{c.body}</div>
          {c.attachment_path && (
            <Button variant="outline" size="sm" onClick={() => openCircularAttachment(c.attachment_path!).catch((e) => toast.error('Could not open the attachment', { description: errorMessage(e) }))}>
              <Paperclip className="h-4 w-4" /> {c.attachment_name ?? 'Attachment'}
            </Button>
          )}
        </div>

        {mine && c.requires_ack && (
          <div className={cn('border-t border-border p-5', mine.acknowledged_at ? 'bg-success/5' : 'bg-primary/5')}>
            {mine.acknowledged_at ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="h-5 w-5" /> You acknowledged this on {fmt(mine.acknowledged_at)}{mine.ack_with_signature ? ' (signed)' : ''}.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Please confirm you have read and understood this circular.</p>
                  {hasSignature ? (
                    <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={sign} onChange={(e) => setSign(e.target.checked)} /> Sign with my e-signature
                    </label>
                  ) : (
                    <button onClick={() => navigate('/settings')} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><PenLine className="h-3 w-3" /> Add your e-signature in Settings to sign it</button>
                  )}
                </div>
                <Button onClick={runAck} loading={ack.isPending}><CheckCircle2 className="h-4 w-4" /> I have read and understood</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {canManage && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <p className="font-display text-base font-semibold">Who has {c.requires_ack ? 'acknowledged' : 'read'} it</p>
              <p className="text-sm text-muted-foreground">{done.length} of {recipients.length} · {outstanding.length} outstanding</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadCsv(`${c.reference_no}-recipients.csv`, [
                ['Name', 'Email', 'Read', 'Acknowledged', 'Signed'],
                ...recipients.map((r) => [r.profile?.full_name ?? '', r.profile?.email ?? '', fmt(r.read_at), fmt(r.acknowledged_at), r.ack_with_signature ? 'Yes' : 'No']),
              ])}><Download className="h-4 w-4" /> Export</Button>
              <Button size="sm" disabled={outstanding.length === 0} loading={remind.isPending}
                onClick={async () => { try { const n = await remind.mutateAsync(c.id); toast.success(`Reminder sent to ${n} ${n === 1 ? 'person' : 'people'}`) } catch (err) { toast.error('Could not send reminders', { description: errorMessage(err) }) } }}>
                <BellRing className="h-4 w-4" /> Remind {outstanding.length} outstanding
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Person</th>
                  <th className="px-5 py-2 font-medium">Read</th>
                  {c.requires_ack && <th className="px-5 py-2 font-medium">Acknowledged</th>}
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...outstanding, ...done].map((r) => {
                  const ok = c.requires_ack ? r.acknowledged_at : r.read_at
                  return (
                    <tr key={r.user_id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-2"><p className="font-medium">{r.profile?.full_name ?? r.profile?.email ?? 'Former member'}</p></td>
                      <td className="px-5 py-2 text-muted-foreground">{fmt(r.read_at)}</td>
                      {c.requires_ack && <td className="px-5 py-2 text-muted-foreground">{fmt(r.acknowledged_at)}{r.ack_with_signature ? ' · signed' : ''}</td>}
                      <td className="px-5 py-2">
                        <Badge variant={ok ? 'success' : r.read_at ? 'warning' : 'muted'}>
                          {ok ? (c.requires_ack ? 'Acknowledged' : 'Read') : r.read_at ? 'Read, not acknowledged' : 'Not opened'}
                        </Badge>
                        {r.reminded_at && !ok && <span className="ml-2 text-xs text-muted-foreground">reminded {format(new Date(r.reminded_at), 'd MMM')}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete circular"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>Delete <strong>{c.reference_no}</strong> and its read/acknowledgement record? This can't be undone.</>}
        onConfirm={async () => {
          try { await del.mutateAsync(c); toast.success('Circular deleted'); navigate('/hr/announcements') }
          catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
        }}
      />
    </div>
  )
}
