import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Small edge-mounted toggle, half-overlapping the sidebar's own border —
 * the conventional spot for this (Notion/Linear/VS Code's collapsible
 * sidebars all put it here, not buried in a top bar). Desktop only; the
 * mobile drawer already has its own separate open/close affordance. */
export function SidebarCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="absolute -right-3 top-20 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:flex"
    >
      {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
    </button>
  )
}
