export function isBrowserPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestBrowserPushPermission(): Promise<NotificationPermission> {
  if (!isBrowserPushSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/** Foreground/backgrounded-tab push only — no service worker in this app. */
export function fireBrowserNotification(title: string, opts?: { body?: string; tag?: string; onClick?: () => void }): void {
  if (!isBrowserPushSupported() || Notification.permission !== 'granted') return
  const n = new Notification(title, { body: opts?.body, tag: opts?.tag, icon: '/scales.svg' })
  if (opts?.onClick) {
    n.onclick = () => {
      window.focus()
      opts.onClick?.()
    }
  }
}
