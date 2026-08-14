import { useLocation, useNavigate } from 'react-router-dom'
import { Check, LogOut, Menu, Settings, UserCircle, Users2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBackToWorkspaceTarget } from '@/shared/hooks/use-back-to-workspace-target'
import { ROLE_META } from '@/shared/lib/permissions'
import { initialsOf } from '@/shared/lib/format'
import { Button } from '@/shared/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import { GlobalSearch } from '@/shared/components/layout/global-search'
import { NotificationBell } from '@/features/notifications/components/notification-bell'
import { SubscriptionStatusPill } from '@/features/subscription-billing/components/subscription-status-banner'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { profile, memberships, activeMembership, activeOrgId, setActiveOrg, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inHrWorkspace = location.pathname.startsWith('/hr')
  const backToWorkspaceTarget = useBackToWorkspaceTarget()

  const roleKey = activeMembership?.role.key
  const roleLabel = roleKey ? ROLE_META[roleKey]?.label : activeMembership?.role.name

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <SubscriptionStatusPill />
        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-full py-1 pl-2 pr-1 transition-colors hover:bg-accent">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-sm font-medium">{profile?.full_name ?? 'Your account'}</span>
                {roleLabel && <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>}
              </span>
              <Avatar className="h-8 w-8">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                <AvatarFallback>{initialsOf(profile?.full_name ?? profile?.email)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{profile?.full_name ?? 'Your account'}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
              {profile?.is_platform_admin ? (
                <Badge variant="default" className="mt-2">Platform Admin</Badge>
              ) : (
                roleLabel && <Badge variant="secondary" className="mt-2">{roleLabel}</Badge>
              )}
            </div>

            {memberships.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Switch firm</DropdownMenuLabel>
                {memberships.map((m) => (
                  <DropdownMenuItem key={m.organization_id} onClick={() => setActiveOrg(m.organization_id)}>
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/12 text-[10px] font-semibold text-primary">
                      {initialsOf(m.organization.name, 'OR')}
                    </span>
                    <span className="flex-1 truncate">{m.organization.name}</span>
                    {m.organization_id === activeOrgId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}

            <DropdownMenuSeparator />
            {inHrWorkspace ? (
              <DropdownMenuItem onClick={() => navigate(backToWorkspaceTarget)}>
                <ArrowLeft /> Back to Workspace
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => navigate('/hr')}>
                <Users2 /> HR Workspace
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <UserCircle /> Profile & account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                await signOut()
                navigate('/auth/login', { replace: true })
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
