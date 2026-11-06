import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useFundRequests } from '@/features/funds/hooks/use-funds'
import { FundRequestForm } from '@/features/funds/components/fund-request-form'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'

/** /hr/funds/new and /hr/funds/:id/edit — the request form on its own page. */
export function FundRequestFormPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { data: requests, isLoading } = useFundRequests(activeOrgId)
  const request = id ? requests?.find((r) => r.id === id) ?? null : null
  const back = id ? `/hr/funds/${id}` : '/hr/funds'

  if (id && isLoading) return <Skeleton className="mx-auto h-96 max-w-3xl" />
  if (id && (!request || request.user_id !== userId || !['draft', 'returned'].includes(request.status))) {
    return (
      <Card className="mx-auto max-w-3xl p-10 text-center">
        <p className="font-medium">This request can’t be edited</p>
        <p className="mt-1 text-sm text-muted-foreground">Only your own drafts, or requests sent back to you for changes, can be edited.</p>
        <Button asChild variant="outline" className="mt-4"><Link to={back}>Back</Link></Button>
      </Card>
    )
  }

  const returned = request?.status === 'returned'
  return (
    <div className="w-full">
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Back to request' : 'Fund Requests'}
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {!request ? 'Request funds' : returned ? 'Update and resubmit' : `Edit ${request.request_number ?? 'draft'}`}
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Your firm’s approval rules decide who signs off, based on the amount, category and your department. Save a draft any time.
      </p>
      <Card className="p-6">
        <FundRequestForm
          request={request}
          initial={id ? undefined : { title: params.get('title') ?? undefined, category: params.get('category') ?? undefined }}
          onDone={(rec) => navigate(`/hr/funds/${rec.id}`)}
          onCancel={() => navigate(back)}
        />
      </Card>
    </div>
  )
}
