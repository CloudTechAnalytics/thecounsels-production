import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Briefcase, Users, FileText, CheckSquare, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useGlobalSearch } from '@/features/search/hooks/use-global-search'
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

interface ResultItem {
  key: string
  label: string
  hint?: string
  icon: LucideIcon
  href: string
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const { data, isFetching } = useGlobalSearch(activeOrgId, open ? query : '')

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.key is undefined on some real devices during IME composition —
      // Samsung's stock Android keyboard in particular is a known source
      // of keydown events with no key set at all. This listener is global
      // (window, not a focused element), so it sees every keystroke in the
      // app; optional chaining turns that into a silent no-op instead of
      // crashing (confirmed live via the platform Error Logs viewer —
      // "Cannot read properties of undefined (reading 'toLowerCase')").
      if (e.key?.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const go = (href: string) => {
    setOpen(false)
    navigate(href)
  }

  const groups: { label: string; items: ResultItem[] }[] = [
    {
      label: 'Matters',
      items: (data?.matters ?? []).map((m) => ({
        key: `m-${m.id}`,
        label: m.title,
        hint: m.matter_number ?? undefined,
        icon: Briefcase,
        href: `/matters/${m.id}`,
      })),
    },
    {
      label: 'Clients',
      items: (data?.clients ?? []).map((c) => ({
        key: `c-${c.id}`,
        label: c.display_name,
        hint: c.type,
        icon: Users,
        href: '/clients',
      })),
    },
    {
      label: 'Documents',
      items: (data?.documents ?? []).map((d) => ({
        key: `d-${d.id}`,
        label: d.name,
        icon: FileText,
        href: d.matter_id ? `/matters/${d.matter_id}` : '/documents',
      })),
    },
    {
      label: 'Tasks',
      items: (data?.tasks ?? []).map((t) => ({
        key: `t-${t.id}`,
        label: t.title,
        hint: t.status.replace('_', ' '),
        icon: CheckSquare,
        href: t.matter_id ? `/matters/${t.matter_id}` : '/tasks',
      })),
    },
  ].filter((g) => g.items.length > 0)

  const hasResults = groups.length > 0
  const canSearch = query.trim().length >= 2

  return (
    <>
      {/* Desktop: search field. Mobile: icon button. Both open the dialog. */}
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:flex lg:w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent md:hidden"
      >
        <Search className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4 pr-10">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search matters, clients, documents, tasks…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!canSearch ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search across your firm.
              </p>
            ) : isFetching && !hasResults ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : hasResults ? (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.label}>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </p>
                    {g.items.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => go(item.href)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="shrink-0 font-mono text-xs capitalize text-muted-foreground">{item.hint}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No results for “{query.trim()}”.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
