import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import { initSentry } from '@/app/sentry'
import { installGlobalErrorLogging } from '@/shared/lib/error-log'
import { ErrorBoundary } from '@/shared/components/error-boundary'
import { setupPwa } from '@/shared/lib/pwa'
import '@/app/globals.css'

initSentry()
installGlobalErrorLogging()
setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
