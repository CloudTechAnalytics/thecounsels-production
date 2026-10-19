import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { formatPostDate, type BlogPost } from '@/features/blog/posts'

export const AUTHOR = 'The Counsel Team'

export function CategoryChip({ category }: { category: BlogPost['category'] }) {
  return (
    <span className="rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">{category}</span>
  )
}

export function PostMeta({ post }: { post: BlogPost }) {
  return (
    <p className="text-xs text-muted-foreground">
      {AUTHOR} <span aria-hidden>·</span> {formatPostDate(post.date)} <span aria-hidden>·</span> {post.readMinutes} min
      read
    </p>
  )
}

/** Top-of-index card: big 16:9 cover over the text. */
export function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-1 hover:shadow-elevated"
    >
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          src={post.cover}
          alt=""
          width={1200}
          height={675}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <CategoryChip category={post.category} />
        <h2 className="mt-4 font-display text-xl font-semibold leading-snug">{post.title}</h2>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
        <div className="mt-5">
          <PostMeta post={post} />
        </div>
      </div>
    </Link>
  )
}

/** List row on the index: cover on the left, text on the right. */
export function PostRow({ post }: { post: BlogPost }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group grid gap-5 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated sm:grid-cols-[17rem_1fr] sm:items-center sm:gap-7"
    >
      <div className="aspect-video overflow-hidden rounded-xl bg-muted">
        <img
          src={post.cover}
          alt=""
          width={1200}
          height={675}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="min-w-0 pr-2 sm:py-2">
        <CategoryChip category={post.category} />
        <h2 className="mt-3 font-display text-xl font-semibold leading-snug">{post.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <PostMeta post={post} />
          <span className="hidden items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">
            Read <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  )
}
