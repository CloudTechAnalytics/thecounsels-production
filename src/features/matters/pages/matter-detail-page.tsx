import * as React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Trash2, LockOpen, FileText, StickyNote, LayoutGrid, Activity, Gavel, CheckSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatter, useDeleteMatter, useReopenMatter } from '@/features/matters/hooks/use-matters'
import { MatterFormDialog } from '@/features/matters/components/matter-form-dialog'
import { DocumentsPanel } from '@/features/matters/components/documents-panel'
import { NotesPanel } from '@/features/matters/components/notes-panel'
import { MatterTimeline } from '@/features/matters/components/matter-timeline'
import { MatterHearingsPanel } from '@/features/matters/components/matter-hearings-panel'
import { MatterTasksPanel } from '@/features/matters/components/matter-tasks-panel'
import { MatterSummaryCard } from '@/features/matters/components/matter-summary-card'
import { MatterProgressCard } from '@/features/matters/components/matter-progress-card'
import { MatterTeamCard } from '@/features/matters/components/matter-team-card'
import { MATTER_STATUS_META } from '@/features/matters/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { cn } from '@/shared/lib/utils'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'timeline', label: 'Timeline', icon: Activity },
  { key: 'hearings', label: 'Hearings', icon: Gavel },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'notes', label: 'Notes', icon: StickyNote },
] as const
type TabKey = (typeof TABS)[number]['key']

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

export function MatterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: matter, isLoading, isError } = useMatter(id)
  const del = useDeleteMatter(activeOrgId)
  const reopen = useReopenMatter(activeOrgId)
  const [tab, setTab] = React.useState<TabKey>('overview')
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [reopenOpen, setReopenOpen] = React.useState(false)
  const [reopenReason, setReopenReason] = React.useState('')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!matter || isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-lg font-semibold">Matter not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/matters')}>
          <ArrowLeft className="h-4 w-4" /> Back to matters
        </Button>
      </div>
    )
  }

  const status = MATTER_STATUS_META[matter.status]
  const isClosed = ['closed', 'won', 'lost'].includes(matter.status)

  return (
    <div>
      <Link to="/matters" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Matters
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{matter.matter_number}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant="muted" className="capitalize">{matter.priority} priority</Badge>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">{matter.title}</h1>
          {matter.client && <p className="text-sm text-muted-foreground">for {matter.client.display_name}</p>}
        </div>
        <div className="flex gap-2">
          {has('matters.update') && !isClosed && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {isClosed && has('matters.reopen') && (
            <Button variant="outline" onClick={() => setReopenOpen(true)}>
              <LockOpen className="h-4 w-4" /> Reopen matter
            </Button>
          )}
          {has('matters.delete') && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {isClosed && (
        <p className="mt-3 text-sm text-muted-foreground">
          This matter is closed and read-only. Historical data remains fully visible, but no new notes, tasks,
          documents, hearings, or billing entries can be added while it stays closed.
        </p>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <div className="grid gap-5 sm:grid-cols-2">
                <Detail label="Client" value={matter.client?.display_name} />
                <Detail label="Practice area" value={matter.practice_area} />
                <Detail
                  label="Lead lawyer"
                  value={
                    matter.lead_lawyer ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                          {initialsOf(matter.lead_lawyer.full_name, 'L')}
                        </span>
                        {matter.lead_lawyer.full_name}
                      </span>
                    ) : null
                  }
                />
                <Detail label="Opposing counsel" value={matter.opposing_counsel} />
                <Detail label="Court" value={matter.court} />
                <Detail label="Judge" value={matter.judge} />
                <Detail label="Opened" value={format(new Date(matter.opened_on), 'PP')} />
                <Detail label="Closed" value={matter.closed_on ? format(new Date(matter.closed_on), 'PP') : null} />
              </div>
              {matter.description && (
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{matter.description}</p>
                </div>
              )}
            </Card>
            <div className="space-y-6">
              <MatterSummaryCard matter={matter} onNavigateTab={setTab} />
              <MatterProgressCard matter={matter} />
              <MatterTeamCard matterId={matter.id} />
            </div>
          </div>
        )}
        {tab === 'timeline' && <MatterTimeline matter={matter} />}
        {tab === 'hearings' && <MatterHearingsPanel matterId={matter.id} readOnly={isClosed} />}
        {tab === 'tasks' && <MatterTasksPanel matterId={matter.id} readOnly={isClosed} />}
        {tab === 'documents' && <DocumentsPanel matterId={matter.id} readOnly={isClosed} />}
        {tab === 'notes' && <NotesPanel matterId={matter.id} readOnly={isClosed} />}
      </div>

      <MatterFormDialog matter={matter} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={(o) => { setReopenOpen(o); if (!o) setReopenReason('') }}
        title={`Reopen matter ${matter.matter_number ?? ''}`}
        confirmLabel="Reopen matter"
        loading={reopen.isPending}
        description="This restores normal permissions for everyone with access to this matter, and is recorded in the Activity Timeline."
        onConfirm={async () => {
          try {
            await reopen.mutateAsync({ id: matter.id, reason: reopenReason.trim() || undefined })
            toast.success('Matter reopened')
            setReopenOpen(false)
            setReopenReason('')
          } catch (err) {
            toast.error('Could not reopen matter', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} autoFocus placeholder="e.g. Client disputed the closure" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete matter"
        destructive
        confirmLabel="Delete matter"
        loading={del.isPending}
        description={<>This permanently deletes <strong>{matter.title}</strong> and its notes and documents.</>}
        onConfirm={async () => {
          try {
            await del.mutateAsync({ id: matter.id, label: `${matter.matter_number} — ${matter.title}` })
            toast.success('Matter deleted')
            navigate('/matters')
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
