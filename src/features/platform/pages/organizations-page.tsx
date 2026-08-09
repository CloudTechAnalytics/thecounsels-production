import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  MoreHorizontal,
  Ban,
  RotateCcw,
  Trash2,
  Eye,
  Pencil,
  ArrowLeftRight,
  CreditCard,
  Receipt,
  ScrollText,
  LifeBuoy,
  Globe,
  Undo2,
  Eraser,
} from 'lucide-react'
import {
  usePlatformOrganizations,
  useSetOrganizationStatus,
  useSoftDeleteOrganization,
  useRestoreOrganization,
  useHardDeleteOrganization,
  useResetDemoOrganization,
} from '@/features/platform/hooks/use-platform'
import { CreateOrganizationDialog } from '@/features/platform/components/create-organization-dialog'
import { EditOrganizationDialog } from '@/features/platform/components/edit-organization-dialog'
import { ViewOrganizationDialog } from '@/features/platform/components/view-organization-dialog'
import { SupportSessionDialog } from '@/features/platform/components/support-session-dialog'
import type { OrgRow } from '@/features/platform/types'
import { PageHeader } from '@/shared/components/page-header'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Card } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { initialsOf, titleCase, formatStorage, daysUntil } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/ui/sonner'

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  active: 'success',
  trial: 'warning',
  suspended: 'destructive',
  cancelled: 'muted',
}

function TrialBadge({ org }: { org: OrgRow }) {
  if (org.subscription?.status !== 'trialing') return null
  const d = daysUntil(org.subscription.trial_ends_at)
  if (d == null) return <Badge variant="warning">Trial</Badge>
  return <Badge variant={d <= 3 ? 'destructive' : 'warning'}>{d < 0 ? 'Expired' : `${d}d trial`}</Badge>
}

function ActiveRowActions({ org }: { org: OrgRow }) {
  const navigate = useNavigate()
  const setStatus = useSetOrganizationStatus()
  const softDelete = useSoftDeleteOrganization()
  const resetDemo = useResetDemoOrganization()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [viewOpen, setViewOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [supportOpen, setSupportOpen] = React.useState(false)
  const suspended = org.status === 'suspended'
  const isDemo = org.organization_type === 'demo'
  const soon = () => toast.info('Coming soon', { description: 'This action arrives in a later phase.' })

  const toggle = async () => {
    try {
      await setStatus.mutateAsync({ id: org.id, status: suspended ? 'active' : 'suspended' })
      toast.success(suspended ? 'Organization activated' : 'Organization suspended')
    } catch (err) {
      toast.error('Action failed', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{org.name}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setViewOpen(true)}><Eye /> View</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil /> Edit</DropdownMenuItem>
          {suspended ? (
            <DropdownMenuItem onClick={toggle}><RotateCcw /> Activate</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={toggle}><Ban /> Suspend</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={soon}><ArrowLeftRight /> Transfer ownership</DropdownMenuItem>
          {isDemo && (
            <DropdownMenuItem onClick={() => setConfirmReset(true)}><Eraser /> Reset demo data</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/platform/subscriptions')}><CreditCard /> View subscription</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/platform/billing')}><Receipt /> View billing</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/platform/audit')}><ScrollText /> Open audit logs</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSupportOpen(true)}><LifeBuoy /> Start support session</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete organization"
        destructive
        confirmPhrase="DELETE ORGANIZATION"
        confirmLabel="Move to trash"
        loading={softDelete.isPending}
        description={
          <>
            <strong>{org.name}</strong> will be moved to Trash and permanently deleted after{' '}
            <strong>30 days</strong>. You can restore it any time before then.
          </>
        }
        onConfirm={async () => {
          try {
            await softDelete.mutateAsync(org.id)
            toast.success('Moved to trash', { description: `${org.name} will be purged in 30 days.` })
            setConfirmDelete(false)
          } catch (err) {
            toast.error('Delete failed', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data"
        destructive
        confirmLabel="Reset data"
        loading={resetDemo.isPending}
        description={
          <>
            Clears every client, matter, document, task, hearing, and billing record in{' '}
            <strong>{org.name}</strong> so it can be demoed fresh. The organization and its users stay
            intact.
          </>
        }
        onConfirm={async () => {
          try {
            await resetDemo.mutateAsync(org.id)
            toast.success('Demo data cleared')
            setConfirmReset(false)
          } catch (err) {
            toast.error('Reset failed', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />

      <ViewOrganizationDialog org={org} open={viewOpen} onOpenChange={setViewOpen} />
      <EditOrganizationDialog org={org} open={editOpen} onOpenChange={setEditOpen} />
      <SupportSessionDialog org={{ id: org.id, name: org.name }} open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  )
}

function TrashRowActions({ org }: { org: OrgRow }) {
  const restore = useRestoreOrganization()
  const hardDelete = useHardDeleteOrganization()
  const [confirm, setConfirm] = React.useState(false)
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={restore.isPending}
        onClick={async () => {
          try {
            await restore.mutateAsync(org.id)
            toast.success('Organization restored')
          } catch (err) {
            toast.error('Restore failed', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      >
        <Undo2 className="h-4 w-4" /> Restore
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
        <Trash2 className="h-4 w-4" /> Delete forever
      </Button>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Permanently delete organization"
        destructive
        confirmPhrase="DELETE PERMANENTLY"
        confirmLabel="Delete forever"
        loading={hardDelete.isPending}
        description={
          <>
            <strong>{org.name}</strong> and all its data will be <strong>permanently removed</strong>. This cannot be
            undone.
          </>
        }
        onConfirm={async () => {
          try {
            const result = await hardDelete.mutateAsync(org.id)
            if (result.warning) {
              toast.warning('Organization deleted', { description: result.warning })
            } else {
              toast.success('Organization permanently deleted')
            }
            setConfirm(false)
          } catch (err) {
            toast.error('Delete failed', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}

export function OrganizationsPage() {
  const [trash, setTrash] = React.useState(false)
  const { data, isLoading, isError, error } = usePlatformOrganizations(trash)

  return (
    <div>
      <PageHeader
        title={trash ? 'Trash' : 'Organizations'}
        description={trash ? 'Soft-deleted organizations, purged after 30 days.' : 'Every law firm on the platform.'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant={trash ? 'default' : 'outline'} onClick={() => setTrash((t) => !t)}>
              <Trash2 className="h-4 w-4" /> {trash ? 'Back to active' : 'Trash'}
            </Button>
            {!trash && <CreateOrganizationDialog />}
          </div>
        }
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
              <Globe className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold">Couldn't load organizations</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {errorMessage(error, 'Something went wrong loading this list. Please try again.')}
            </p>
          </div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                        {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : initialsOf(org.name, 'OR')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{org.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {org.industry ? `${org.industry} · ` : ''}/{org.slug}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {org.organization_type === 'customer' ? (
                      <Badge variant="outline">{org.subscription?.plan?.name ?? titleCase(org.plan)}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No billing</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {org.organization_type !== 'customer' ? (
                        <Badge variant="muted" className="capitalize">{org.organization_type}</Badge>
                      ) : (
                        <>
                          <Badge variant={STATUS_VARIANT[org.status] ?? 'muted'}>{org.status}</Badge>
                          <TrialBadge org={org} />
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{org.member_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatStorage(org.storage_used_bytes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.subscription?.current_period_end ? format(new Date(org.subscription.current_period_end), 'MMM d, yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(org.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    {trash ? <TrashRowActions org={org} /> : <ActiveRowActions org={org} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Globe className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold">{trash ? 'Trash is empty' : 'No organizations yet'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {trash ? 'Deleted organizations will appear here.' : 'Create your first law firm workspace and its administrator.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
