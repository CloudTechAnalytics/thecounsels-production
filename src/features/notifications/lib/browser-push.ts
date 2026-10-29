export function isBrowserPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestBrowserPushPermission(): Promise<NotificationPermission> {
  if (!isBrowserPushSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/**
 * Foreground/backgrounded-tab notification (no server push).
 *
 * Goes through the service worker when one is active: Android Chrome refuses
 * `new Notification()` outright, and on an installed iPhone app it's the only
 * route. Tapping it is then handled by sw.js (`notificationclick`), which
 * focuses the app and opens `url`. Plain desktop tabs without a worker fall
 * back to the page-level Notification and its onClick.
 */
export function fireBrowserNotification(title: string, opts?: { body?: string; tag?: string; url?: string; onClick?: () => void }): void {
  if (!isBrowserPushSupported() || Notification.permission !== 'granted') return
  const options = { body: opts?.body, tag: opts?.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: opts?.url } }

  const viaPage = () => {
    try {
      const n = new Notification(title, options)
      if (opts?.onClick) {
        n.onclick = () => {
          window.focus()
          opts.onClick?.()
        }
      }
    } catch {
      /* this browser only allows notifications from a service worker */
    }
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(viaPage)
  } else {
    viaPage()
  }
}
