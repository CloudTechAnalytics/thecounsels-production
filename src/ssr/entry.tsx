/**
 * Build-time prerender of the public marketing site (see scripts/prerender.mjs).
 *
 * Renders each public page with the same components the browser uses, so
 * the HTML a crawler receives carries that page's own heading, copy and
 * links instead of an empty shell. In the browser, main.tsx still mounts the
 * full client app over it (createRoot, not hydration).
 */
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/shared/context/theme-provider'
import { AuthProvider } from '@/features/auth/context/auth-provider'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { takeSsrSeo, type SeoMeta } from '@/shared/hooks/use-seo'
import { LandingPage } from '@/features/landing/pages/landing-page'
import { TermsPage } from '@/features/landing/pages/terms-page'
import { PrivacyPage } from '@/features/landing/pages/privacy-page'
import { LegalPracticeManagementSoftwareAfricaPage } from '@/features/landing/pages/legal-practice-management-software-africa-page'
import { PricingPage } from '@/features/landing/pages/pricing-page'
import { FeaturesPage } from '@/features/landing/pages/features-page'
import { BlogPage } from '@/features/blog/pages/blog-page'
import { BlogPostPage } from '@/features/blog/pages/blog-post-page'
import { LawFirmManagementSoftwarePage } from '@/features/landing/pages/law-firm-management-software-page'
import { LegalCaseManagementSoftwarePage } from '@/features/landing/pages/legal-case-management-software-page'
import { LawFirmBillingSoftwarePage } from '@/features/landing/pages/law-firm-billing-software-page'
import { POSTS } from '@/features/blog/posts'

/** Every public, indexable URL. Keep in sync with public/sitemap.xml. */
export const ROUTES: string[] = [
  '/',
  '/features',
  '/pricing',
  '/blog',
  ...POSTS.map((p) => `/blog/${p.slug}`),
  '/legal-practice-management-software-africa',
  '/law-firm-management-software',
  '/legal-case-management-software',
  '/law-firm-billing-software',
  '/terms',
  '/privacy',
]

export function render(url: string): { html: string; seo: SeoMeta | null } {
  takeSsrSeo() // clear anything left from the previous page
  const html = renderToString(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <TooltipProvider>
            <StaticRouter location={url}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogPostPage />} />
                <Route path="/legal-practice-management-software-africa" element={<LegalPracticeManagementSoftwareAfricaPage />} />
                <Route path="/law-firm-management-software" element={<LawFirmManagementSoftwarePage />} />
                <Route path="/legal-case-management-software" element={<LegalCaseManagementSoftwarePage />} />
                <Route path="/law-firm-billing-software" element={<LawFirmBillingSoftwarePage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
              </Routes>
            </StaticRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { html, seo: takeSsrSeo() }
}
