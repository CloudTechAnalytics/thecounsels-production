import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'

export function TwoFactorCard() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Two-factor authentication</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">An extra code at sign-in, on top of your password.</p>
        </div>
        <Badge variant="warning">Roadmap</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Authenticator-app 2FA is planned but not yet available. This card will let you enrol once it ships.
        </div>
      </CardContent>
    </Card>
  )
}
