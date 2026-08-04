import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/hooks/use-notifications'
import { isBrowserPushSupported, requestBrowserPushPermission } from '@/features/notifications/lib/browser-push'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ToggleSwitch } from '@/shared/components/toggle-switch'
import { toast } from '@/shared/components/ui/sonner'

/** Delivery-channel toggles for the signed-in user. Shared by the Notifications
 * page's Preferences tab and the Settings page (where `title`/`description` give
 * it its own card header instead of relying on a surrounding tab label). */
export function NotificationPreferencesCard({
  className,
  title,
  description,
}: {
  className?: string
  title?: string
  description?: string
}) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const { data: prefs, isLoading } = useNotificationPreferences(userId)
  const update = useUpdateNotificationPreferences(userId)

  const toggleBrowser = async (next: boolean) => {
    if (next) {
      const permission = await requestBrowserPushPermission()
      if (permission !== 'granted') {
        toast.error('Browser permission denied', {
          description: 'Allow notifications for this site in your browser settings, then try again.',
        })
        return
      }
    }
    update.mutate({ browser_enabled: next })
  }

  const body =
    isLoading || !prefs ? (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    ) : (
      <div className="space-y-3">
        <ToggleSwitch
          icon={Bell}
          label="In-app"
          hint="Show notifications in the bell and on this page."
          checked={prefs.in_app_enabled}
          onChange={(v) => update.mutate({ in_app_enabled: v })}
        />
        <ToggleSwitch
          icon={Smartphone}
          label="Browser"
          hint={isBrowserPushSupported() ? 'Get a desktop notification while this app is open in a tab.' : 'Not supported in this browser.'}
          checked={prefs.browser_enabled}
          disabled={!isBrowserPushSupported()}
          onChange={toggleBrowser}
        />
        <ToggleSwitch
          icon={Mail}
          label="Email"
          hint="Coming soon — arrives with the Email Notification Engine milestone."
          checked={prefs.email_enabled}
          disabled
          onChange={() => {}}
        />
        <ToggleSwitch
          icon={MessageSquare}
          label="SMS"
          hint="Future — no SMS provider is configured yet."
          checked={prefs.sms_enabled}
          disabled
          onChange={() => {}}
        />
      </div>
    )

  if (!title) {
    return <Card className={className ?? 'max-w-xl p-6'}>{body}</Card>
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
