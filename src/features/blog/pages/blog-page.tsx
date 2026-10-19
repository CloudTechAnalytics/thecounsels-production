import { useState } from 'react'
import { useSeo } from '@/shared/hooks/use-seo'
import { cn } from '@/shared/lib/utils'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { POSTS, type BlogPost } from '@/features/blog/posts'
import { PostCard, PostRow } from '@/features/blog/components/post-card'

const CATEGORIES: Array<BlogPost['category'] | 'All'> = [
  'All',
  'Practice management',
  'Litigation',
  'Billing',
  'Growing a firm',
]

/** Blog index: three latest as cover cards, everything else as a list, with category filters. */
export function BlogPage() {
  useSeo({
    title: 'The Counsel Journal: Practice Management Articles for Law Firms',
    description:
      'Practical articles for law firms across Africa on court dates, billing, matter management and running a modern practice.',
    canonicalPath: '/blog',
  })
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>('All')

  const filtered = filter === 'All' ? POSTS : POSTS.filter((p) => p.category === filter)
  const top = filter === 'All' ? filtered.slice(0, 3) : []
  const rest = filter === 'All' ? filtered.slice(3) : filtered

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">The Journal</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Notes on running a modern law practice
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Practical guides for firms across Africa on court dates, billing, matters and the everyday work
            that keeps a practice running well.
          </p>

          <div role="tablist" aria-label="Filter articles" className="mt-8 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={filter === c}
                onClick={() => setFilter(c)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  filter === c
                    ? 'border-primary bg-primary text-primary-foreground shadow-gold'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          {top.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {top.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <>
              {top.length > 0 && (
                <h2 className="mb-6 mt-14 font-display text-2xl font-semibold">More articles</h2>
              )}
              <div className={cn('mx-auto flex max-w-4xl flex-col gap-5', top.length === 0 && 'mt-2')}>
                {rest.map((p) => (
                  <PostRow key={p.slug} post={p} />
                ))}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <p className="py-16 text-center text-muted-foreground">No articles in this category yet.</p>
          )}
        </section>

        <SeoCtaBand heading="Put these ideas to work in your firm" />
      </main>

      <SiteFooter />
    </div>
  )
}
