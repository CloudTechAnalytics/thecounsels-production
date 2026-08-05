import * as React from 'react'
import { Search, Plus, Users, Building2, User, MoreHorizontal, Pencil, Trash2, Mail, Phone, AlertTriangle, Contact } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useClients, useDeleteClient, useClientMatterCount } from '@/features/clients/hooks/use-clients'
import { ClientFormDialog } from '@/features/clients/components/client-form-dialog'
import { ManageContactsDialog } from '@/features/clients/components/manage-contacts-dialog'
import type { ClientFilters } from '@/features/clients/services/clients.service'
import type { Client } from '@/shared/types/database.types'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const STATUS: Record<string, BadgeProps['variant']> = {
  active: 'success',
  prospect: 'warning',
  inactive: 'muted',
}

export function ClientsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [type, setType] = React.useState<ClientFilters['type']>('all')
  const [status, setStatus] = React.useState<ClientFilters['status']>('all')
  const filters: ClientFilters = { search, type, status }
  const { data, isLoading } = useClients(activeOrgId, filters)
  const del = useDeleteClient(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Client | null>(null)
  const [toDelete, setToDelete] = React.useState<Client | null>(null)
  const [managingContacts, setManagingContacts] = React.useState<Client | null>(null)
  const { data: matterCount } = useClientMatterCount(toDelete?.id)
  const hasMatters = Boolean(matterCount)

  const canCreate = has('clients.create')
  const canUpdate = has('clients.update')
  const canDelete = has('clients.delete')

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (c: Client) => {
    setEditing(c)
    setFormOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Individuals and corporate clients your firm represents."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="clients"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Clients',
                rows: (data ?? []).map((c) => ({
                  Name: c.display_name,
                  Type: c.type,
                  Status: c.status,
                  Email: c.email ?? '',
                  Phone: c.phone ?? '',
                  Company: c.company_name ?? '',
                  'Registration number': c.registration_number ?? '',
                  Contacts: c.contacts[0]?.count ?? 0,
                  City: c.city ?? '',
                  Country: c.country ?? '',
                  Added: c.created_at.slice(0, 10),
                })),
              }]}
            />
            {canCreate && <Button onClick={openNew}><Plus /> New client</Button>}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, contact or email…"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as ClientFilters['type'])}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as ClientFilters['status'])}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                        {initialsOf(c.display_name, 'CL')}
                      </span>
                      <span className="truncate text-sm font-medium">{c.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm capitalize text-muted-foreground">
                      {c.type === 'corporate' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      {c.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 text-sm">
                      {c.email && (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="h-3 w-3" /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                      {!c.email && !c.phone && <span className="text-muted-foreground">—</span>}
                      <button
                        type="button"
                        onClick={() => setManagingContacts(c)}
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Contact className="h-3 w-3" /> {c.contacts[0]?.count ?? 0} contact{(c.contacts[0]?.count ?? 0) === 1 ? '' : 's'}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[c.status] ?? 'muted'} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil /> {canUpdate ? 'Edit' : 'View details'}
                        </DropdownMenuItem>
                        {canDelete && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(c)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Users className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold">
              {search || type !== 'all' || status !== 'all' ? 'No clients match your filters' : 'No clients yet'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {search || type !== 'all' || status !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Add the individuals and companies your firm represents.'}
            </p>
            {canCreate && !search && type === 'all' && status === 'all' && (
              <Button onClick={openNew} className="mt-1">
                <Plus /> New client
              </Button>
            )}
          </div>
        )}
      </Card>

      <ClientFormDialog
        client={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onViewExisting={(displayName) => setSearch(displayName)}
        readOnly={Boolean(editing) && !canUpdate}
      />

      <ManageContactsDialog
        client={managingContacts}
        open={Boolean(managingContacts)}
        onOpenChange={(o) => !o && setManagingContacts(null)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete client"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        confirmPhrase={hasMatters ? toDelete?.display_name : undefined}
        description={
          hasMatters ? (
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                <strong>{toDelete?.display_name}</strong> has <strong>{matterCount}</strong> matter{matterCount === 1 ? '' : 's'} attached.
                Deleting this client permanently deletes {matterCount === 1 ? 'that matter' : 'all of them'} too — including its
                documents, hearings, tasks, notes and timeline. Time entries, expenses and invoices are kept but detached.
                This cannot be undone.
              </span>
            </span>
          ) : (
            <>This permanently removes <strong>{toDelete?.display_name}</strong>.</>
          )
        }
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync({ id: toDelete.id, name: toDelete.display_name, matterCount: matterCount ?? 0 })
            toast.success(hasMatters ? `Client and ${matterCount} matter${matterCount === 1 ? '' : 's'} deleted` : 'Client deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
