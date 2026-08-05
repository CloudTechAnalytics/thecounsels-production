import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** When set, the confirm button stays disabled until the user types this phrase. */
  confirmPhrase?: string
  confirmLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
  /** Extra content rendered between the description and the footer (e.g. a required reason field). */
  children?: React.ReactNode
  /** Externally controlled disable, combined with the confirmPhrase lock if both are set. */
  disableConfirm?: boolean
}

/** Reusable confirmation modal with optional type-to-confirm safety for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel = 'Confirm',
  destructive,
  loading,
  onConfirm,
  children,
  disableConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('')
  React.useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const locked = (confirmPhrase ? typed.trim() !== confirmPhrase : false) || Boolean(disableConfirm)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmPhrase && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">{confirmPhrase}</span> to confirm.
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={confirmPhrase} />
          </div>
        )}

        {children}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={locked}
            loading={loading}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
