import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { usePayments } from '@/features/billing/hooks/use-billing'
import { PaymentDetailDialog } from '@/features/billing/components/payment-detail-dialog'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatNaira } from '@/shared/lib/format'

/** Payments & Receipts — every payment recorded across the firm, each opening its own receipt/detail view. */
export function PaymentsTab({ onViewInvoice }: { onViewInvoice: (invoiceId: string) => void }) {
  const { activeOrgId } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  const { data, isLoading } = usePayments(activeOrgId)

  const [search, setSearch] = React.useState('')
  const [clientId, setClientId] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [openId, setOpenId] = React.useState<string | null>(null)

  const rows = data ?? []
  const filtered = rows.filter((p) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${p.payment_number ?? ''} ${p.receipt_number ?? ''} ${p.invoice?.invoice_number ?? ''} ${p.client?.display_name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (clientId !== 'all' && p.client?.id !== clientId) return false
    if (dateFrom && p.paid_at < dateFrom) return false
    if (dateTo && p.paid_at > dateTo) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payment #, receipt #, invoice #, client…" className="pl-9" />
          </div>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" aria-label="From date" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" aria-label="To date" />
        </div>
        <ExportButton
          filename="payments"
          disabled={filtered.length === 0}
          sheets={() => [{
            name: 'Payments',
            rows: filtered.map((p) => ({
              'Payment #': p.payment_number ?? '',
              'Receipt #': p.receipt_number ?? '',
              'Invoice #': p.invoice?.invoice_number ?? '',
              Client: p.client?.display_name ?? '',
              Matter: p.matter?.matter_number ?? '',
              Amount: Number(p.amount),
              Date: p.paid_at,
              Method: p.method ?? '',
              Reference: p.reference ?? '',
              'Recorded by': p.created_by_profile?.full_name ?? '',
              'Created at': p.created_at,
            })),
          }]}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Payment #</TableHead><TableHead>Receipt #</TableHead><TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead><TableHead>Matter</TableHead><TableHead>Date</TableHead>
              <TableHead>Method</TableHead><TableHead>Recorded by</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(p.id)}>
                  <TableCell className="text-sm font-medium">{p.payment_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.receipt_number}</TableCell>
                  <TableCell className="text-sm">{p.invoice?.invoice_number}</TableCell>
                  <TableCell className="text-sm">{p.client?.display_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {p.matter ? (
                      <Link to={`/matters/${p.matter.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {p.matter.matter_number}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(p.paid_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.method ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.created_by_profile?.full_name ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatNaira(Number(p.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No payments recorded yet.' : 'No payments match your filters.'}
          </p>
        )}
      </Card>

      <PaymentDetailDialog paymentId={openId} open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)} onViewInvoice={onViewInvoice} />
    </div>
  )
}
