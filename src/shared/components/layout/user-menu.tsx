import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, UserCircle } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { initialsOf } from '@/shared/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

export function UserMenu({ settingsPath = '/settings' }: { settingsPath?: string }) {
  const { profile, signOut, isPlatformAdmin, activeMembership } = useAuth()
  const navigate = useNavigate()

  const roleLabel = isPlatformAdmin ? 'Platform Admin' : activeMembership?.role.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent">
          <Avatar className="h-8 w-8">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback>{initialsOf(profile?.full_name ?? profile?.email)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{profile?.full_name ?? 'Account'}</span>
            {roleLabel && <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium">{profile?.full_name ?? 'Your account'}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          {isPlatformAdmin && (
            <Badge variant="default" className="mt-2">
              Platform Admin
            </Badge>
          )}
        </div>
        <DropdownMenuSeparator />
        {/* Personal account (profile, password, theme, sessions) — same route for everyone. */}
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <UserCircle /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(settingsPath)}>
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
  )
}
