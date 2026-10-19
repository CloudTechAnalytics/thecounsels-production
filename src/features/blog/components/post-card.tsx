import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Briefcase, Gavel, TrendingUp, type LucideIcon } from 'lucide-react'
import { formatPostDate, type BlogPost } from '@/features/blog/posts'

const CATEGORY_ICON: Record<BlogPost['category'], LucideIcon> = {
  'Practice management': Briefcase,
  Litigation: Gavel,
  Billing: Banknote,
  'Growing a firm': TrendingUp,
}

/** Cover art without image files: a gold-washed panel with the category icon. */
export function PostCover({ category, className = '' }: { category: BlogPost['category']; className?: string }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-card ${className}`}
    >
      <div aria-hidden className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
      <Icon className="relative h-12 w-12 text-primary" strokeWidth={1.5} />
    </div>
  )
}

export function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className={`group flex overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-1 hover:shadow-elevated ${
        featured ? 'flex-col md:flex-row' : 'flex-col'
      }`}
    >
      <PostCover category={post.category} className={featured ? 'h-52 md:h-auto md:w-2/5' : 'h-40'} />
      <div className={`flex flex-1 flex-col p-6 ${featured ? 'md:p-9' : ''}`}>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/12 px-2.5 py-1 font-semibold text-primary">{post.category}</span>
          <span>{formatPostDate(post.date)}</span>
          <span aria-hidden>·</span>
          <span>{post.readMinutes} min read</span>
        </div>
        <h2
          className={`mt-4 font-display font-semibold leading-snug ${featured ? 'text-2xl sm:text-3xl' : 'text-xl'}`}
        >
          {post.title}
        </h2>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">{post.excerpt}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  )
}
