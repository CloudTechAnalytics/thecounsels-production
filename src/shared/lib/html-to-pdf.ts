import { buildPrintDocument, type PrintDocumentOptions } from '@/shared/lib/print-document'

const A4_WIDTH_PX = 794 // 210mm at 96dpi — the width the print layout is designed for

const FACES = ['400 13px Inter', '500 13px Inter', '600 13px Inter', '700 13px Inter', 'italic 400 13px Inter', '600 20px "Playfair Display"', '700 20px "Playfair Display"']

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap'

/** html2canvas measures text in its copy of the page but paints it on a canvas
 * owned by THIS document — so the same faces must be loaded here too, or the
 * words are drawn in a fallback font at Inter's positions. */
async function ensureAppFonts(): Promise<void> {
  if (!document.querySelector(`link[href="${FONT_CSS}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_CSS
    document.head.appendChild(link)
  }
  await loadFonts(document)
}

/** Waits for the stylesheets, then for every font face the print kit uses. */
async function loadFonts(doc: Document): Promise<void> {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
  await Promise.all(links.map((l) => (l.sheet ? Promise.resolve() : new Promise<void>((resolve) => { l.onload = l.onerror = () => resolve() }))))
  await Promise.race([
    Promise.all(FACES.map((f) => doc.fonts.load(f).catch(() => []))).then(() => doc.fonts.ready),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ])
}

/**
 * Turns a branded print document into a real PDF file — same letterhead,
 * layout and e-signature as the printed version — for saving into a matter
 * or downloading without the print dialog. The page is laid out in an
 * off-screen frame, captured at 2× and split across A4 pages. The libraries
 * load only when this is used.
 */
export async function printDocumentToPdf(opts: PrintDocumentOptions): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${A4_WIDTH_PX}px`, height: '1200px', border: '0' })
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument!
    doc.open()
    doc.write(buildPrintDocument(opts, false).replace('</head>', '<style>@media screen{html,body{background:#fff}.sheet{margin:0;box-shadow:none}}</style></head>'))
    doc.close()

    // Fonts, logo and signature must be in before the snapshot.
    const images = Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve() }),
    )
    await Promise.race([
      Promise.all([loadFonts(doc), ensureAppFonts(), ...images]),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ])
    await new Promise((resolve) => setTimeout(resolve, 150))

    const sheet = doc.querySelector('.sheet') as HTMLElement
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: A4_WIDTH_PX,
      logging: false,
      // html2canvas re-renders a copy of the page; its fonts.ready resolves
      // before the Google Fonts stylesheet has even arrived, so text gets
      // measured in a fallback font (gaps before punctuation, overlapping
      // headings). Load every face the documents use before it measures.
      onclone: (cloned) => loadFonts(cloned),
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const pxPerMm = canvas.width / 210
    const pageHeightPx = Math.floor(297 * pxPerMm)
    const topMarginPx = Math.round(14 * pxPerMm) // pages after the first start below a margin
    const ctxFull = canvas.getContext('2d')!
    // Break between lines, never through one: walk up from the page edge to
    // the nearest fully white row.
    const isBlankRow = (y: number) => {
      const row = ctxFull.getImageData(0, y, canvas.width, 1).data
      for (let x = 0; x < row.length; x += 16) if (row[x] < 245 || row[x + 1] < 245 || row[x + 2] < 245) return false
      return true
    }
    let y = 0
    let page = 0
    while (y < canvas.height - 4) {
      const room = page === 0 ? pageHeightPx : pageHeightPx - topMarginPx
      let end = Math.min(y + room, canvas.height)
      if (end < canvas.height) {
        const limit = Math.max(y + room * 0.6, end - Math.round(60 * pxPerMm))
        let cut = end
        while (cut > limit && !isBlankRow(cut)) cut -= 2
        if (cut > limit) end = cut
      }
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = end - y
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      if (page > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, page === 0 ? 0 : 14, 210, slice.height / pxPerMm)
      y = end
      page++
    }
    pdf.setProperties({ title: opts.title, creator: 'The Counsel' })
    return pdf.output('blob')
  } finally {
    frame.remove()
  }
}
