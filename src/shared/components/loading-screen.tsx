import { APP } from '@/shared/config/env'
import { CounselMark } from '@/shared/components/counsel-mark'

/** Full-viewport brand loading state used during auth/session bootstrap. */
export function LoadingScreen({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
        <CounselMark className="relative h-14 w-14" />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-semibold">{APP.product}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
