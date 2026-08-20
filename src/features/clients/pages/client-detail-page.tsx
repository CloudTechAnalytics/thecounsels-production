import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Trash2, Building2, User, LayoutGrid, Briefcase, Receipt, FileText, Contact, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useClient,
  useClientContacts,
  useClientInvoices,
  useClientPayments,
  useClientDocuments,
  useDeleteClient,
  useClientMatterCount,
} from '@/features/clients/hooks/use-clients'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { ClientFormDialog } from '@/features/clients/components/client-form-dialog'
import { ManageContactsDialog } from '@/features/clients/components/manage-contacts-dialog'
import { MATTER_STATUS_META } from '@/features/matters/types'
import { INVOICE_STATUS_META } from '@/features/billing/types'
import { Card } from '@/shared/components/ui/card'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { formatNaira, formatStorage } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/ui/sonner'
import { cn } from '@/shared/lib/utils'

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = { active: 'success', prospect: 'warning', inactive: 'muted' }

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'matters', label: 'Matters', icon: Briefcase },
  { key: 'billing', label: 'Billing', icon: Receipt },
  { key: 'documents', label: 'Documents', icon: FileText },
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

/**
 * Client Detail page — mirrors matter-detail-page.tsx's tabbed structure.
 * Deliberately gets NO read-only/inactive lockout (see plan): there's no
 * existing precedent for treating inactive/prospect clients specially
 * anywhere in this app, unlike matters' isClosed pattern. Edit/Delete stay
 * gated exactly by clients.update/clients.delete regardless of status.
 */
export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: client, isLoading, isError } = useClient(id)
  const del = useDeleteClient(activeOrgId)
  const { data: matterCount } = useClientMatterCount(id)
  const { data: matters } = useMatters(activeOrgId, { clientId: id })
  const { data: contacts } = useClientContacts(id)
  const { data: invoices } = useClientInvoices(id)
  const { data: payments } = useClientPayments(id)
  const { data: documents } = useClientDocuments(id)

  const [tab, setTab] = React.useState<TabKey>('overview')
  const [editOpen, setEditOpen] = React.useState(false)
  const [managingContacts, setManagingContacts] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const canUpdate = has('clients.update')
  const canDelete = has('clients.delete')
  const hasMatters = Boolean(matterCount)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!client || isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-lg font-semibold">Client not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/clients')}>
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </Button>
      </div>
    )
  }

  const doDelete = async () => {
    try {
      await del.mutateAsync({ id: client.id, name: client.display_name, matterCount: matterCount ?? 0 })
      toast.success('Client deleted')
      navigate('/clients')
    } catch (err) {
      toast.error('Could not delete', { description: errorMessage(err) })
    }
  }

  return (
    <div>
      <Link to="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
              {client.type === 'corporate' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              {client.type}
            </span>
            <Badge variant={STATUS_VARIANT[client.status] ?? 'muted'} className="capitalize">{client.status}</Badge>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">{client.display_name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> {canUpdate ? 'Edit' : 'View details'}
          </Button>
          {canDelete && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
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
                <Detail label="Email" value={client.email} />
                <Detail label="Phone" value={client.phone} />
                <Detail label="Company" value={client.company_name} />
                <Detail label="Registration number" value={client.registration_number} />
                <Detail label="Website" value={client.website} />
                <Detail label="Location" value={[client.city, client.country].filter(Boolean).join(', ')} />
                <Detail label="Added" value={format(new Date(client.created_at), 'PP')} />
              </div>
              {client.notes && (
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{client.notes}</p>
                </div>
              )}
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-semibold">Contacts</p>
                <Button variant="ghost" size="sm" onClick={() => setManagingContacts(true)}>
                  <Contact className="h-3.5 w-3.5" /> Manage
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {!contacts?.length ? (
                  <p className="text-sm text-muted-foreground">No contacts added yet.</p>
                ) : (
                  contacts.map((c) => (
                    <div key={c.id} className="text-sm">
                      <p className="font-medium">{c.name} {c.is_primary && <Badge variant="secondary" className="ml-1">Primary</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{[c.title, c.email, c.phone].filter(Boolean).join(' · ')}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === 'matters' && (
          <Card className="overflow-hidden">
            {!matters?.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No matters for this client yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {matters.map((m) => (
                  <Link key={m.id} to={`/matters/${m.id}`} className="flex items-center justify-between p-4 hover:bg-muted/40">
                    <div>
                      <p className="text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.matter_number}</p>
                    </div>
                    <Badge variant={MATTER_STATUS_META[m.status].variant}>{MATTER_STATUS_META[m.status].label}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === 'billing' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <p className="border-b border-border p-4 font-display text-sm font-semibold">Invoices</p>
              {!invoices?.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(inv.created_at), 'PP')}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatNaira(Number(inv.total))}</p>
                        <Badge variant={INVOICE_STATUS_META[inv.status].variant}>{INVOICE_STATUS_META[inv.status].label}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="overflow-hidden">
              <p className="border-b border-border p-4 font-display text-sm font-semibold">Payments</p>
              {!payments?.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">{p.payment_number}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.paid_at), 'PP')}</p>
                      </div>
                      <p className="font-medium">{formatNaira(Number(p.amount))}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === 'documents' && (
          <Card className="overflow-hidden">
            <p className="border-b border-border p-4 text-xs text-muted-foreground">
              Documents across all of this client's matters — documents aren't attached to a client directly.
            </p>
            {!documents?.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No documents yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium">{d.display_name}</p>
                      {d.matter && (
                        <Link to={`/matters/${d.matter.id}`} className="text-xs text-primary hover:underline">{d.matter.matter_number}</Link>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{d.size_bytes != null ? formatStorage(d.size_bytes) : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <ClientFormDialog client={client} open={editOpen} onOpenChange={setEditOpen} readOnly={!canUpdate} />
      <ManageContactsDialog client={client} open={managingContacts} onOpenChange={setManagingContacts} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete client"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        confirmPhrase={hasMatters ? client.display_name : undefined}
        description={
          hasMatters ? (
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                <strong>{client.display_name}</strong> has <strong>{matterCount}</strong> matter{matterCount === 1 ? '' : 's'} attached.
                Deleting this client permanently deletes {matterCount === 1 ? 'that matter' : 'all of them'} too — including its
                documents, hearings, tasks, notes and timeline. Time entries, expenses and invoices are kept but detached.
                This cannot be undone.
              </span>
            </span>
          ) : (
            <>This permanently removes <strong>{client.display_name}</strong>.</>
          )
        }
        onConfirm={doDelete}
      />
    </div>
  )
}
