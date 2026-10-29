import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { POSTS, getPost, type PostBlock } from '@/features/blog/posts'
import { AUTHOR, CategoryChip, PostCard, PostMeta } from '@/features/blog/components/post-card'
import { MaskWords, Rise, StaggerGrid } from '@/features/landing/components/motion-kit'

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 id={slugify(block.text)} className="mt-10 scroll-mt-6 font-display text-2xl font-semibold">
          {block.text}
        </h2>
      )
    case 'p':
      return <p className="mt-4 text-base leading-[1.8] text-foreground/90">{block.text}</p>
    case 'ul':
      return (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-[1.8] text-foreground/90">
          {block.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-[1.8] text-foreground/90">
          {block.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ol>
      )
    case 'quote':
      return (
        <blockquote className="mt-8 border-l-4 border-primary bg-primary/5 px-6 py-4 font-display text-xl italic leading-snug">
          {block.text}
        </blockquote>
      )
  }
}

/** One article at /blog/:slug. Unknown slugs fall back to the blog index. */
export function BlogPostPage() {
  const { slug } = useParams()
  const post = getPost(slug)

  useSeo({
    title: post ? `${post.title} | The Counsel` : 'The Counsel Journal',
    description: post?.excerpt ?? 'Practice management articles for law firms.',
    canonicalPath: post ? `/blog/${post.slug}` : '/blog',
  })

  if (!post) return <Navigate to="/blog" replace />

  const headings = post.body.filter((b): b is Extract<PostBlock, { type: 'h2' }> => b.type === 'h2')
  const more = POSTS.filter((p) => p.slug !== post.slug && p.category === post.category)
    .concat(POSTS.filter((p) => p.slug !== post.slug && p.category !== post.category))
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <article className="mx-auto max-w-6xl px-6 pb-16 pt-12">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> All articles
          </Link>

          <header className="mx-auto mt-6 max-w-3xl text-center">
            <CategoryChip category={post.category} />
            <MaskWords as="h1" play text={post.title} className="mt-4 font-display text-[2.1rem] font-semibold leading-tight sm:text-5xl lg:text-6xl" />
            <Rise as="p" delay={0.35} className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{post.excerpt}</Rise>
            <div className="mt-5 flex justify-center">
              <PostMeta post={post} />
            </div>
          </header>

          <img
            src={post.cover}
            alt=""
            width={1200}
            height={675}
            className="mx-auto mt-10 aspect-video w-full max-w-4xl rounded-2xl border border-border object-cover shadow-card"
          />

          <div className="mx-auto mt-10 grid max-w-4xl gap-10 lg:max-w-5xl lg:grid-cols-[1fr_15rem]">
            <div className="max-w-3xl">
              {post.body.map((b, i) => (
                <Block key={i} block={b} />
              ))}

              <div className="mt-12 flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-lg font-semibold text-primary">
                  C
                </div>
                <div>
                  <p className="text-sm font-semibold">{AUTHOR}</p>
                  <p className="text-sm text-muted-foreground">
                    Practical notes for law firms across Africa from the team building The Counsel.
                  </p>
                </div>
              </div>
            </div>

            {headings.length > 1 && (
              <aside className="hidden lg:block">
                <nav aria-label="In this article" className="sticky top-8 rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    In this article
                  </p>
                  <ul className="mt-3 space-y-2.5 text-sm">
                    {headings.map((h) => (
                      <li key={h.text}>
                        <a
                          href={`#${slugify(h.text)}`}
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>
            )}
          </div>
        </article>

        {more.length > 0 && (
          <section className="border-t border-border bg-card/40">
            <div className="mx-auto max-w-6xl px-6 py-16">
              <MaskWords as="h2" text="Keep reading" className="font-display text-2xl font-semibold" />
              <StaggerGrid className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {more.map((p) => (
                  <PostCard key={p.slug} post={p} />
                ))}
              </StaggerGrid>
            </div>
          </section>
        )}

        <SeoCtaBand heading="Run your firm on one system" />
      </main>

      <SiteFooter />
    </div>
  )
}
