import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { POSTS, formatPostDate, getPost, type PostBlock } from '@/features/blog/posts'
import { PostCard, PostCover } from '@/features/blog/components/post-card'

function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-10 font-display text-2xl font-semibold">{block.text}</h2>
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

  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <article className="mx-auto max-w-3xl px-6 pb-16 pt-14">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> All articles
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-primary/12 px-2.5 py-1 font-semibold text-primary">{post.category}</span>
            <span>{formatPostDate(post.date)}</span>
            <span aria-hidden>·</span>
            <span>{post.readMinutes} min read</span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">{post.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>

          <PostCover category={post.category} className="mt-8 h-44 rounded-2xl border border-border" />

          <div className="mt-6">
            {post.body.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>
        </article>

        {more.length > 0 && (
          <section className="border-t border-border bg-card/40">
            <div className="mx-auto max-w-5xl px-6 py-16">
              <h2 className="font-display text-2xl font-semibold">Keep reading</h2>
              <div className="mt-8 grid gap-8 md:grid-cols-2">
                {more.map((p) => (
                  <PostCard key={p.slug} post={p} />
                ))}
              </div>
            </div>
          </section>
        )}

        <SeoCtaBand heading="Run your firm on one system" />
      </main>

      <SiteFooter />
    </div>
  )
}
