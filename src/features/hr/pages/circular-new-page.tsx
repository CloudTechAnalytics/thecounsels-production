import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Paperclip, X, CheckCircle2, Pin } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useDepartments, useEmployees } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { CIRCULAR_CATEGORIES, useSendCircular } from '@/features/hr/hooks/use-circulars'
import { ANNOUNCEMENT_AUDIENCES } from '@/features/hr/types'
import { ROLE_META } from '@/shared/lib/permissions'
import type { RoleKey } from '@/shared/types/database.types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ToggleSwitch } from '@/shared/components/toggle-switch'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const ROLE_OPTIONS = Object.entries(ROLE_META)
  .filter(([key]) => key !== 'platform_owner' && key !== 'platform_admin')
  .sort(([, a], [, b]) => a.rank - b.rank)
  .map(([key, meta]) => ({ key, label: meta.label }))
const MAX_FILE = 10 * 1024 * 1024

/** Write and send a circular — a full page, not a pop-up. */
export function CircularNewPage() {
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: departments = [] } = useDepartments(activeOrgId)
  const { data: employees = [] } = useEmployees(activeOrgId)
  const { data: branches = [] } = useBranches(activeOrgId)
  const send = useSendCircular(activeOrgId)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState<string>('Notice')
  const [body, setBody] = React.useState('')
  const [audience, setAudience] = React.useState('organization')
  const [departmentId, setDepartmentId] = React.useState('')
  const [branchId, setBranchId] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('')
  const [people, setPeople] = React.useState<string[]>([])
  const [requiresAck, setRequiresAck] = React.useState(false)
  const [ackDue, setAckDue] = React.useState('')
  const [pinned, setPinned] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [peopleSearch, setPeopleSearch] = React.useState('')

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Add a title and the message'); return }
    if (audience === 'department' && !departmentId) { toast.error('Choose a department'); return }
    if (audience === 'branch' && !branchId) { toast.error('Choose a branch'); return }
    if (audience === 'role' && !roleKey) { toast.error('Choose a role'); return }
    if (audience === 'employees' && people.length === 0) { toast.error('Choose at least one person'); return }
    try {
      const c = await send.mutateAsync({
        title: title.trim(), body: body.trim(), audienceType: audience,
        departmentId: audience === 'department' ? departmentId : null,
        branchId: audience === 'branch' ? branchId : null,
        roleKey: audience === 'role' ? (roleKey as RoleKey) : null,
        userIds: audience === 'employees' ? people : null,
        requiresAck, ackDue: requiresAck ? ackDue || null : null, pinned, category, file,
      })
      toast.success(`${c.reference_no} sent to ${c.recipient_count} ${c.recipient_count === 1 ? 'person' : 'people'}`)
      navigate(`/hr/announcements/${c.id}`)
    } catch (err) { toast.error('Could not send the circular', { description: errorMessage(err) }) }
  }

  const shownPeople = employees.filter((e) => e.userId && (`${e.fullName ?? ''} ${e.email ?? ''}`.toLowerCase().includes(peopleSearch.toLowerCase())))

  return (
    <div className="w-full max-w-4xl">
      <Link to="/hr/announcements" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Circulars
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">New circular</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/hr/announcements')}>Cancel</Button>
          <Button onClick={submit} loading={send.isPending}>Send circular</Button>
        </div>
      </div>

      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Revised dress code policy" /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CIRCULAR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Message</Label><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the circular here…" /></div>
          <div className="space-y-1.5">
            <Label>Attachment (optional)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground" /><span className="flex-1 truncate">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /> Attach a file (PDF, Word, image)</Button>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size > MAX_FILE) toast.error('Files must be 10 MB or smaller'); else setFile(f ?? null); e.target.value = '' }} />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Who receives it</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ANNOUNCEMENT_AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {audience === 'branch' && (
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {audience === 'department' && (
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
                  <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {audience === 'role' && (
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={roleKey} onValueChange={setRoleKey}>
                  <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                  <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          {audience === 'employees' && (
            <div className="space-y-2">
              <Input placeholder="Search people" value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} className="sm:max-w-xs" />
              <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                {shownPeople.map((e) => (
                  <label key={e.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={people.includes(e.userId!)}
                      onChange={() => setPeople((p) => (p.includes(e.userId!) ? p.filter((x) => x !== e.userId) : [...p, e.userId!]))} />
                    <span className="truncate">{e.fullName ?? e.email}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{people.length} selected</p>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <ToggleSwitch checked={requiresAck} onChange={setRequiresAck} icon={CheckCircle2} label="Staff must acknowledge it"
            hint="Each person confirms “I have read and understood this”, optionally with their e-signature. You see who hasn't, and can remind them." />
          {requiresAck && (
            <div className="space-y-1.5 sm:max-w-xs">
              <Label>Acknowledge by (optional)</Label>
              <Input type="date" value={ackDue} onChange={(e) => setAckDue(e.target.value)} />
            </div>
          )}
          <ToggleSwitch checked={pinned} onChange={setPinned} icon={Pin} label="Pin to the top" hint="Keeps it at the top of everyone's list and on their dashboard." />
        </Card>
      </div>
    </div>
  )
}
