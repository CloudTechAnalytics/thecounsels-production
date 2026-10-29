import * as React from 'react'
import { Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react'
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

const STEPS = {
  ios: {
    lead: 'It opens full-screen like any other app.',
    steps: [
      <>
        Tap the <Share className="mx-0.5 inline h-4 w-4 -translate-y-px text-primary" /> <b>Share</b> button. In Safari it's in the bottom bar; in Chrome
        it's next to the address bar.
      </>,
      <>
        Scroll down and tap <SquarePlus className="mx-0.5 inline h-4 w-4 -translate-y-px text-primary" /> <b>Add to Home Screen</b>.
      </>,
      <>
        Tap <b>Add</b>. The Counsel icon appears on your Home Screen.
      </>,
    ],
  },
  android: {
    lead: 'It opens full-screen like any other app.',
    steps: [
      <>
        Tap the <MoreVertical className="mx-0.5 inline h-4 w-4 -translate-y-px text-primary" /> <b>menu</b> at the top right of Chrome.
      </>,
      <>
        Tap <b>Install app</b> (on some phones it says <b>Add to Home screen</b>).
      </>,
      <>
        Tap <b>Install</b>. The Counsel icon appears on your Home screen.
      </>,
    ],
  },
}

/** Step-by-step install instructions for when the browser won't show its own install button. */
export function InstallStepsDialog({ platform, open, onOpenChange }: { platform: 'ios' | 'android'; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { lead, steps } = STEPS[platform]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add The Counsel to your Home Screen</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4 text-sm">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

/** Starts the right install flow for this device. `available` is false when the app is installed or can't be. */
export function useInstallAction() {
  const { mode, install } = usePwaInstall()
  const [stepsOpen, setStepsOpen] = React.useState(false)
  const start = React.useCallback(() => {
    if (mode === 'prompt') void install()
    else if (mode) setStepsOpen(true)
  }, [mode, install])
  const dialog = mode === 'ios' || mode === 'android' ? <InstallStepsDialog platform={mode} open={stepsOpen} onOpenChange={setStepsOpen} /> : null
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
