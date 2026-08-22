import * as React from 'react'
import { Search, Users, Scale, Briefcase } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFirmMembers, useAllMatterAssignments } from '@/features/matters/hooks/use-matters'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useStaffProfiles } from '@/features/staff/hooks/use-staff'
import { StaffProfileDialog } from '@/features/staff/components/staff-profile-dialog'
import { AVAILABILITY_META, type StaffMember } from '@/features/staff/types'
import { isMatterClosed } from '@/features/matters/types'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { initialsOf } from '@/shared/lib/format'
import { MapPin } from 'lucide-react'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'

export function StaffPage() {
  const { activeOrgId, activeMembership } = useAuth()
  const { has } = usePermissions()
  const { data: members, isLoading } = useFirmMembers(activeOrgId)
  const { data: profiles } = useStaffProfiles(activeOrgId)
  const { data: matters } = useMatters(activeOrgId, {})
  const { data: assignments } = useAllMatterAssignments(activeOrgId)
  const { data: branches } = useBranches(activeOrgId)
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState('all')
  const [selected, setSelected] = React.useState<StaffMember | null>(null)

  const canManage = has('staff.manage')
  const profileByUser = React.useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles])

  // A branch-scoped viewer (access_scope 'branch'/'multiple_branches') only
  // ever sees colleagues who share one of their own branches, or org-wide
  // leadership — never an unfiltered firm-wide roster. An organization-
  // scope viewer (e.g. Managing Partner) sees everyone by default, with an
  // optional filter to narrow down to one branch at a time.
  const myScope = activeMembership?.access_scope ?? 'organization'
  const myBranchIds = React.useMemo(
    () => new Set((activeMembership?.member_branches ?? []).map((mb) => mb.branch_id)),
    [activeMembership],
  )
  const isBranchRestrictedViewer = myScope === 'branch' || myScope === 'multiple_branches'

  // "Active matters" used to only count matters someone LED (lead_lawyer_id)
  // — always 0 for support staff (paralegals, litigation clerks,
  // secretaries) genuinely working a matter as a team member, never its
  // lead. Now counts both, deduped so leading AND being on the team of
  // the same matter isn't double-counted.
  const mattersByUser = React.useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (userId: string, matterId: string) => {
      if (!map.has(userId)) map.set(userId, new Set())
      map.get(userId)!.add(matterId)
    }
    for (const m of matters ?? []) {
      if (m.lead_lawyer_id) add(m.lead_lawyer_id, m.id)
    }
    for (const a of assignments ?? []) {
      add(a.user_id, a.matter_id)
    }
    return map
  }, [matters, assignments])

  const matterById = React.useMemo(() => new Map((matters ?? []).map((m) => [m.id, m])), [matters])
  const activeCountByUser = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const [userId, matterIds] of mattersByUser) {
      let count = 0
      for (const id of matterIds) {
        const m = matterById.get(id)
        if (m && !isMatterClosed(m.status)) count++
      }
      map.set(userId, count)
    }
    return map
  }, [mattersByUser, matterById])

  const roster: StaffMember[] = (members ?? [])
    .filter((m) => {
      const name = m.profile?.full_name ?? m.profile?.email ?? ''
      return name.toLowerCase().includes(search.toLowerCase())
    })
    .filter((m) => {
      // Organization-scope colleagues (leadership) are always visible,
      // regardless of who's looking.
      if (m.access_scope === 'organization') return true
      const memberBranchIds = m.member_branches.map((mb) => mb.branch_id)
      if (isBranchRestrictedViewer) return memberBranchIds.some((id) => myBranchIds.has(id))
      if (branchFilter === 'all') return true
      return memberBranchIds.includes(branchFilter)
    })
    .map((member) => ({
      member,
      profile: profileByUser.get(member.user_id) ?? null,
      activeMatters: activeCountByUser.get(member.user_id) ?? 0,
    }))

  const assignedMattersFor = (userId: string) =>
    [...(mattersByUser.get(userId) ?? [])].map((id) => matterById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))

  return (
    <div>
      <PageHeader
        title="Lawyers & Staff"
        description="Your firm's team, qualifications and workload."
        actions={
          <ExportButton
            filename="lawyers-staff"
            disabled={roster.length === 0}
            sheets={() => [{
              name: 'Team',
              rows: roster.map((s) => ({
                Name: s.member.profile?.full_name ?? '',
                Email: s.member.profile?.email ?? '',
                Role: s.member.role?.name ?? '',
                Title: s.member.title ?? '',
                'Bar number': s.profile?.bar_number ?? '',
                'Year admitted': s.profile?.year_admitted ?? '',
                Specializations: (s.profile?.specializations ?? []).join(', '),
                Availability: AVAILABILITY_META[s.profile?.availability ?? 'available']?.label ?? '',
                'Active matters': s.activeMatters,
              })),
            }]}
          />
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team…" className="pl-9" />
        </div>
        {!isBranchRestrictedViewer && branches && branches.length > 1 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)}
        </div>
      ) : roster.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((s) => {
            const avail = AVAILABILITY_META[s.profile?.availability ?? 'available'] ?? AVAILABILITY_META.available
            return (
              <Card
                key={s.member.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(s)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(s)}
                className="cursor-pointer p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      {s.member.profile?.avatar_url && <AvatarImage src={s.member.profile.avatar_url} alt="" />}
                      <AvatarFallback>{initialsOf(s.member.profile?.full_name, 'U')}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.member.profile?.full_name ?? s.member.profile?.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.member.role?.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {s.member.access_scope === 'organization'
                          ? 'All branches'
                          : s.member.member_branches.map((mb) => mb.branch?.name).filter(Boolean).join(', ') || 'No branch'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={avail.variant}>{avail.label}</Badge>
                </div>

                {s.profile?.specializations && s.profile.specializations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.profile.specializations.slice(0, 3).map((sp) => (
                      <Badge key={sp} variant="outline" className="text-[11px]">{sp}</Badge>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {s.activeMatters} active</span>
                  {s.profile?.bar_number && <span className="flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> {s.profile.bar_number}</span>}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Users className="h-7 w-7" /></span>
          <p className="font-display text-lg font-semibold">No team members yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add users from Firm Settings and they'll appear here.</p>
        </Card>
      )}

      {selected && (
        <StaffProfileDialog
          member={selected.member}
          profile={selected.profile}
          assignedMatters={assignedMattersFor(selected.member.user_id)}
          canManage={canManage}
          open={Boolean(selected)}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </div>
  )
}
