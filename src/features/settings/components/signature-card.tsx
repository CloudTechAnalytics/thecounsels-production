import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine, Upload, Eraser, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { supabase } from '@/shared/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const W = 600
const H = 200

/** Crops to the ink and returns a compact PNG — keeps stored signatures small. */
function trimmedPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 8
  minX = Math.max(minX - pad, 0); minY = Math.max(minY - pad, 0)
  maxX = Math.min(maxX + pad, canvas.width - 1); maxY = Math.min(maxY + pad, canvas.height - 1)
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

/** Uploaded photo/scan → transparent PNG: white paper becomes see-through. */
async function imageToSignature(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That file is not an image we can read'))
      i.src = url
    })
    const scale = Math.min(W * 1.5 / img.width, H * 1.5 / img.height, 1)
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale)
    c.height = Math.round(img.height * scale)
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const px = ctx.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < px.data.length; i += 4) {
      const light = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3
      if (light > 200) px.data[i + 3] = 0
    }
    ctx.putImageData(px, 0, 0)
    return trimmedPng(c)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SignatureCard() {
  const { userId } = useAuth()
  const qc = useQueryClient()
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const drawing = React.useRef(false)
  const [hasInk, setHasInk] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  const { data: saved } = useQuery({
    queryKey: ['my-signature', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase.from('user_signatures').select('image, updated_at').eq('user_id', userId!).maybeSingle()
      return data
    },
  })
  const save = useMutation({
    mutationFn: async (image: string) => {
      const { error } = await supabase.from('user_signatures').upsert({ user_id: userId!, image, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-signature', userId] }),
  })
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('user_signatures').delete().eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-signature', userId] }),
  })

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H }
  }
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1b2a4a'
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = point(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasInk(true)
  }
  const clear = () => {
    canvasRef.current?.getContext('2d')!.clearRect(0, 0, W, H)
    setHasInk(false)
  }
  const store = async (image: string | null) => {
    if (!image) { toast.error('Draw or upload your signature first'); return }
    try {
      await save.mutateAsync(image)
      toast.success('Signature saved', { description: 'It will appear on documents you sign.' })
      setEditing(false)
      clear()
    } catch (err) { toast.error('Could not save signature', { description: errorMessage(err) }) }
  }
  const onUpload = async (file: File | undefined) => {
    if (!file) return
    try { await store(await imageToSignature(file)) } catch (err) { toast.error('Could not use that image', { description: errorMessage(err) }) }
  }

  const showPad = editing || !saved

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PenLine className="h-4 w-4 text-primary" /> My signature</CardTitle>
        <CardDescription>
          Added automatically to documents you sign: receipts you record, invoices you raise, fund requests you request, approve or pay out, and letters you generate. Only colleagues in your firm can see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved && !editing && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex h-24 min-w-[220px] items-end rounded-lg border border-dashed border-border bg-white px-4 pb-2">
              <img src={saved.image} alt="Your signature" className="max-h-20 max-w-[320px] object-contain" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PenLine className="h-4 w-4" /> Change</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" loading={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Signature removed'), onError: (e) => toast.error('Could not remove', { description: errorMessage(e) }) })}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
        )}
        {showPad && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-border bg-white">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className={cn('block h-40 w-full max-w-xl touch-none cursor-crosshair')}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={() => { drawing.current = false }}
                onPointerLeave={() => { drawing.current = false }}
              />
              <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-stone-300" />
              {!hasInk && <p className="pointer-events-none absolute left-6 top-4 text-xs text-stone-400">Sign here with your mouse, trackpad or finger</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={clear} disabled={!hasInk}><Eraser className="h-4 w-4" /> Clear</Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload a photo instead</Button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              <div className="flex gap-2">
                {saved && <Button variant="ghost" size="sm" onClick={() => { setEditing(false); clear() }}>Cancel</Button>}
                <Button size="sm" onClick={() => store(canvasRef.current ? trimmedPng(canvasRef.current) : null)} loading={save.isPending} disabled={!hasInk}>Save signature</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Uploading? Sign on white paper and take a clear photo — the white background is removed automatically.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
