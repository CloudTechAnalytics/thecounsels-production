import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { POSTS } from '@/features/blog/posts'
import { PostCard } from '@/features/blog/components/post-card'

/** Blog index: newest article featured, the rest in a grid. */
export function BlogPage() {
  useSeo({
    title: 'The Counsel Journal: Practice Management Articles for Law Firms',
    description:
      'Practical articles for law firms across Africa on court dates, billing, matter management and running a modern practice.',
    canonicalPath: '/blog',
  })

  const [featured, ...rest] = POSTS

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-5xl px-6 pb-12 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">The Journal</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Notes on running a modern law practice
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Practical guides for firms across Africa on court dates, billing, matter management and the
            everyday work that keeps a practice running well.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          {featured && <PostCard post={featured} featured />}
          {rest.length > 0 && (
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {rest.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          )}
        </section>

        <SeoCtaBand heading="Put these ideas to work in your firm" />
      </main>

      <SiteFooter />
    </div>
  )
}
