import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      // Prerender build only: the real client reads window at import time.
      ...(isSsrBuild ? { '@/shared/lib/supabase': fileURLToPath(new URL('./src/ssr/supabase-stub.ts', import.meta.url)) } : {}),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Bundle everything into the prerender build so CSS imports from packages don't trip Node.
  ssr: { noExternal: true },
  server: {
    port: 5173,
    open: true,
  },
}))
