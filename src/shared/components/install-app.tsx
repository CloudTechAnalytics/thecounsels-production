import * as React from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { usePwaInstall } from '@/shared/hooks/use-pwa-install'
import { CounselMark } from '@/shared/components/counsel-mark'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'

const DISMISS_KEY = 'counsel.install_dismissed_at'
const REMIND_AFTER_DAYS = 14

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return Boolean(at) && Date.now() - at < REMIND_AFTER_DAYS * 864e5
  } catch {
    return false
  }
}

/** Share → Add to Home Screen, spelled out — iOS has no install button. */
export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add The Counsel to your Home Screen</DialogTitle>
          <DialogDescription>It opens full-screen like any other app. This works in Safari.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4 text-sm">
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">1</span>
            <span className="pt-1">
              Tap the <Share className="mx-0.5 inline h-4 w-4 -translate-y-px text-primary" /> <b>Share</b> button in Safari's toolbar.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">2</span>
            <span className="pt-1">
              Scroll down and tap <SquarePlus className="mx-0.5 inline h-4 w-4 -translate-y-px text-primary" /> <b>Add to Home Screen</b>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">3</span>
            <span className="pt-1">
              Tap <b>Add</b>. The Counsel icon appears on your Home Screen.
            </span>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}

/** Starts the right install flow for this device. Returns null when the app is installed or can't be. */
export function useInstallAction() {
  const { mode, install } = usePwaInstall()
  const [iosOpen, setIosOpen] = React.useState(false)
  const start = React.useCallback(() => {
    if (mode === 'ios') setIosOpen(true)
    else if (mode === 'prompt') void install()
  }, [mode, install])
  const dialog = <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
  return { available: mode !== null, start, dialog }
}

/** Phone-only card inviting the user to install the app. Dismissal is remembered for two weeks. */
export function InstallAppBanner() {
  const { available, start, dialog } = useInstallAction()
  const [hidden, setHidden] = React.useState(recentlyDismissed)

  if (!available || hidden) return dialog
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* private mode: just hide for this visit */
    }
    setHidden(true)
  }

  return (
    <>
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-primary/25 bg-card p-3 shadow-sm lg:hidden">
        <CounselMark className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold">Get the app</p>
          <p className="text-xs text-muted-foreground">Add The Counsel to your Home Screen.</p>
        </div>
        <Button size="sm" onClick={start}>
          <Download className="h-4 w-4" /> Install
        </Button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="-mr-1 rounded-full p-1.5 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
      {dialog}
    </>
  )
}
