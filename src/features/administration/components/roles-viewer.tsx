import { ShieldCheck } from 'lucide-react'
import { useRolesWithPermissions } from '@/features/administration/hooks/use-administration'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { titleCase } from '@/shared/lib/format'

export function RolesViewer() {
  const { data, isLoading } = useRolesWithPermissions()

  if (isLoading) {
    return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}</div>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data?.map((role) => {
        const byCategory = role.permissions.reduce<Record<string, string[]>>((acc, p) => {
          ;(acc[p.resource] ??= []).push(p.action)
          return acc
        }, {})
        return (
          <Card key={role.id} className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">{role.name}</h3>
              <Badge variant="muted" className="ml-auto">{role.permissions.length} permissions</Badge>
            </div>
            {role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}
            <div className="mt-3 space-y-1.5">
              {Object.entries(byCategory).map(([cat, actions]) => (
                <div key={cat} className="flex items-start gap-2 text-xs">
                  <span className="w-28 shrink-0 font-medium">{titleCase(cat)}</span>
                  <span className="text-muted-foreground">{actions.join(', ')}</span>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
      <p className="text-xs text-muted-foreground md:col-span-2">
        Roles and their permissions are managed by CloudTech. Assign roles to users from the Members tab.
      </p>
    </div>
  )
}
