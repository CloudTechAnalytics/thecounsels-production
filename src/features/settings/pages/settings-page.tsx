import { AppearanceCard } from '@/features/settings/components/appearance-card'
import { ChangePasswordCard } from '@/features/settings/components/change-password-card'
import { ProfileCard } from '@/features/settings/components/profile-card'
import { SessionsCard } from '@/features/settings/components/sessions-card'
import { TwoFactorCard } from '@/features/settings/components/two-factor-card'
import { NotificationPreferencesCard } from '@/features/notifications/components/notification-preferences-card'
import { PageHeader } from '@/shared/components/page-header'

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Your profile, security and preferences." />

      <div className="space-y-6">
        <ProfileCard />

        <div className="grid gap-6 lg:grid-cols-2">
          <ChangePasswordCard />
          <AppearanceCard />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <NotificationPreferencesCard title="Notifications" description="How you'd like to hear from The Counsel." />
          <SessionsCard />
        </div>

        <TwoFactorCard />
      </div>
    </div>
  )
}
