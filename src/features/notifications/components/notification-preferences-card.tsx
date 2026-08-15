import * as React from 'react'
import { Bell, Mail, MessageSquare, MessageCircle, Smartphone } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/hooks/use-notifications'
import { isBrowserPushSupported, requestBrowserPushPermission } from '@/features/notifications/lib/browser-push'
import { DEFAULT_TASK_CHANNEL_PREFS } from '@/features/notifications/services/notifications.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ToggleSwitch } from '@/shared/components/toggle-switch'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/components/ui/sonner'
import type { TaskChannelEvent, TaskChannelPrefs } from '@/shared/types/database.types'

const TASK_EVENT_ORDER: TaskChannelEvent[] = ['assigned', 'due_soon', 'overdue', 'completed', 'reassigned', 'hearing_reminder']
const TASK_EVENT_LABELS: Record<TaskChannelEvent, string> = {
  assigned: 'Task assigned to you',
  due_soon: 'Upcoming deadline reminders',
  overdue: 'Task overdue',
  completed: 'A task you created is completed',
  reassigned: 'Task reassigned to you',
  hearing_reminder: 'Hearing coming up (24h / 1h before)',
}

/** Per-task-event Email/WhatsApp matrix — in-app is intentionally absent here;
 * task-assignment in-app notifications stay the one always-on "critical" channel. */
function TaskChannelMatrix({
  prefs,
  emailEnabled,
  whatsappEnabled,
  onChange,
}: {
  prefs: TaskChannelPrefs
  emailEnabled: boolean
  whatsappEnabled: boolean
  onChange: (next: TaskChannelPrefs) => void
}) {
  const setCell = (event: TaskChannelEvent, channel: 'email' | 'whatsapp', value: boolean) => {
    onChange({ ...prefs, [event]: { ...prefs[event], [channel]: value } })
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Notification</th>
            <th className="w-16 px-3 py-2 text-center font-medium">Email</th>
            <th className="w-20 px-3 py-2 text-center font-medium">WhatsApp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {TASK_EVENT_ORDER.map((event) => (
            <tr key={event}>
              <td className="px-3 py-2">{TASK_EVENT_LABELS[event]}</td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label={`Email for ${TASK_EVENT_LABELS[event]}`}
                  className="h-4 w-4 accent-primary disabled:opacity-40"
                  checked={prefs[event]?.email ?? true}
                  disabled={!emailEnabled}
                  onChange={(e) => setCell(event, 'email', e.target.checked)}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label={`WhatsApp for ${TASK_EVENT_LABELS[event]}`}
                  className="h-4 w-4 accent-primary disabled:opacity-40"
                  checked={prefs[event]?.whatsapp ?? true}
                  disabled={!whatsappEnabled}
                  onChange={(e) => setCell(event, 'whatsapp', e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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

  const [whatsappNumber, setWhatsappNumber] = React.useState('')
  React.useEffect(() => {
    setWhatsappNumber(prefs?.whatsapp_number ?? '')
  }, [prefs?.whatsapp_number])

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

  const saveWhatsappNumber = () => {
    const trimmed = whatsappNumber.trim()
    if (trimmed !== (prefs?.whatsapp_number ?? '')) {
      update.mutate({ whatsapp_number: trimmed || null })
    }
  }

  const body =
    isLoading || !prefs ? (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
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
          hint="Get task and deadline emails sent to your account email."
          checked={prefs.email_enabled}
          onChange={(v) => update.mutate({ email_enabled: v })}
        />
        <div className="space-y-2">
          <ToggleSwitch
            icon={MessageCircle}
            label="WhatsApp"
            hint="Delivery requires your firm to configure a WhatsApp provider — until then, messages won't send even if enabled here."
            checked={prefs.whatsapp_enabled}
            onChange={(v) => update.mutate({ whatsapp_enabled: v })}
          />
          {prefs.whatsapp_enabled && (
            <div className="space-y-1.5 rounded-lg border border-border px-4 py-3">
              <Label htmlFor="whatsapp-number" className="text-xs">WhatsApp number</Label>
              <Input
                id="whatsapp-number"
                type="tel"
                placeholder="+234…"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                onBlur={saveWhatsappNumber}
              />
              <p className="text-xs text-muted-foreground">Kept separate from your regular phone number on file.</p>
            </div>
          )}
        </div>
        <ToggleSwitch
          icon={MessageSquare}
          label="SMS"
          hint="Future — no SMS provider is configured yet."
          checked={prefs.sms_enabled}
          disabled
          onChange={() => {}}
        />

        <div className="border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium">Task &amp; hearing notification channels</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Choose which events send Email/WhatsApp. Each column only applies once its channel above is enabled.
          </p>
          <TaskChannelMatrix
            prefs={prefs.task_channel_prefs ?? DEFAULT_TASK_CHANNEL_PREFS}
            emailEnabled={prefs.email_enabled}
            whatsappEnabled={prefs.whatsapp_enabled}
            onChange={(next) => update.mutate({ task_channel_prefs: next })}
          />
        </div>
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
