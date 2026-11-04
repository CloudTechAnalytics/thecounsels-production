import * as React from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * Renders the small slice of Markdown the AI writes — headings, **bold**,
 * *italic*, `code`, bullet and numbered lists, tables and rules — as real
 * elements, so replies don't show raw asterisks. Builds React nodes (no HTML
 * injection), and anything it doesn't recognise falls through as plain text.
 */

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[]; start: number }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }
  | { kind: 'quote'; text: string }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) { flush(); continue }
    let m: RegExpMatchArray | null
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { flush(); out.push({ kind: 'hr' }); continue }
    if ((m = line.match(HEADING))) { flush(); out.push({ kind: 'h', level: m[1].length, text: m[2] }); continue }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]))
      i--
      out.push({ kind: 'table', head, rows })
      continue
    }
    if ((m = line.match(BULLET)) || (m = line.match(NUMBERED))) {
      flush()
      const ordered = NUMBERED.test(line)
      const start = ordered ? Number(line.match(NUMBERED)![1]) : 1
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        const b = ordered ? l.match(NUMBERED) : l.match(BULLET)
        if (b) items.push(ordered ? b[2] : b[1])
        else if (l.trim() && /^\s{2,}/.test(l) && items.length) items[items.length - 1] += ' ' + l.trim()
        else break
        i++
      }
      i--
      out.push({ kind: ordered ? 'ol' : 'ul', items, start })
      continue
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flush(); out.push({ kind: 'quote', text: m[1] }); continue }
    para.push(line)
  }
  flush()
  return out
}

/** Bold, italic and inline code inside a line. */
function inline(text: string, key = 'i'): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])\*(?!\s)([^*\n]+?)\*(?!\w)|(?<![\w_])_(?!\s)([^_\n]+?)_(?!\w)/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[2] !== undefined) nodes.push(<strong key={k} className="font-semibold text-foreground">{inline(m[2], k)}</strong>)
    else if (m[3] !== undefined) nodes.push(<code key={k} className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[0.85em]">{m[3]}</code>)
    else nodes.push(<em key={k}>{inline(m[4] ?? m[5], k)}</em>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const withBreaks = (text: string, key: string) =>
  text.split('\n').flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)))

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parse(text), [text])
  return (
    <div className={cn('space-y-2.5 break-words leading-relaxed', className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`
        switch (b.kind) {
          case 'h':
            return (
              <p key={k} className={cn('font-semibold text-foreground', b.level <= 2 ? 'pt-1 text-[0.95rem]' : 'text-sm')}>
                {inline(b.text, k)}
              </p>
            )
          case 'p':
            return <p key={k}>{withBreaks(b.text, k)}</p>
          case 'ul':
            return (
              <ul key={k} className="space-y-1 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0">{inline(it, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={k} className="space-y-1 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="min-w-[1.25rem] shrink-0 font-semibold tabular-nums text-primary">{b.start + j}.</span>
                    <span className="min-w-0">{inline(it, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            )
          case 'table':
            return (
              <div key={k} className="overflow-x-auto rounded-md border border-border bg-background">
                <table className="w-full text-xs">
                  <thead className="bg-foreground/[0.04]">
                    <tr>{b.head.map((h, j) => <th key={j} className="px-2.5 py-1.5 text-left font-semibold text-foreground">{inline(h, `${k}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t border-border">
                        {r.map((c, x) => <td key={x} className="px-2.5 py-1.5 align-top">{inline(c, `${k}-${j}-${x}`)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'quote':
            return <p key={k} className="border-l-2 border-primary/60 pl-3 text-muted-foreground">{inline(b.text, k)}</p>
          case 'hr':
            return <hr key={k} className="border-border" />
        }
      })}
    </div>
  )
}
