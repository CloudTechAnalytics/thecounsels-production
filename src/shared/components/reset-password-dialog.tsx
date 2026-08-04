import * as React from 'react'
import { Check, Copy, KeyRound, RefreshCw } from 'lucide-react'
import { generateTempPassword } from '@/shared/lib/password'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'

/**
 * Admin-assisted password reset — sets a new temporary password for someone
 * else's account, bypassing email entirely. Shared by the Administration
 * members panel and the Platform Users page.
 */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  name,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Who this reset is for, e.g. their name or email — shown in the confirmation copy. */
  name: string
  onSubmit: (password: string) => Promise<void>
}) {
  const [password, setPassword] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setPassword(generateTempPassword())
      setCopied(false)
    }
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select and copy the password manually')
    }
  }

  const submit = async () => {
    if (password.length < 10) {
      toast.error('Password must be at least 10 characters')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(password)
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not reset password', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new temporary password for <strong>{name}</strong>. They'll be required to set their own
            the next time they sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPassword(generateTempPassword())}
              aria-label="Generate a new password"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy password">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Share this with them securely — it won't be shown again.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={submitting}>
            <KeyRound /> Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
