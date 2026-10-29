/**
 * Post-build: write a real HTML file for every public marketing page.
 *
 * Before this, every URL served the same empty index.html — homepage title,
 * homepage canonical, no content until JavaScript ran — so Google treated
 * the whole site as one page. Each page now ships with its own <title>,
 * description, canonical, social tags and its rendered heading/copy/links.
 *
 * Output (served by Vercel with cleanUrls, see vercel.json):
 *   dist/index.html            the homepage, prerendered
 *   dist/<path>.html           every other public page, prerendered
 *   dist/app.html              the untouched SPA shell, for every app route
 *                            (vercel.json rewrites to "/app": with cleanUrls the
 *                            ".html" form is not matched and 404s)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const ORIGIN = 'https://www.thecounsels.org'

const { render, ROUTES } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'entry.js')).href)
const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
fs.writeFileSync(path.join(dist, 'app.html'), shell)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Replace the content/href of one existing tag in the shell (they span several lines there). */
function setTag(html, pattern, attr, value) {
  const re = new RegExp(`(<${pattern}[^>]*?\\b${attr}=")[^"]*(")`, 's')
  if (!re.test(html)) throw new Error(`tag not found: ${pattern}`)
  return html.replace(re, `$1${esc(value)}$2`)
}

/**
 * Entrance animations render their starting frame on the server (hidden,
 * shifted, clipped). The browser re-renders and animates anyway; the static
 * HTML should show the finished page, so drop those starting styles.
 */
function settle(html) {
  return html
    .replace(/style="([^"]*)"/g, (_, css) => {
      const kept = css
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d && !/^(opacity\s*:\s*0(\.\d+)?|transform\s*:|clip-path\s*:|filter\s*:\s*blur|will-change\s*:)/i.test(d))
        .join(';')
      return kept ? `style="${kept}"` : ''
    })
    .replace(/class="stagger-grid/g, 'class="stagger-grid is-in')
}

let count = 0
for (const route of ROUTES) {
  const { html, seo } = render(route)
  let page = shell.replace('<div id="root" class="h-full"></div>', `<div id="root" class="h-full" data-prerendered>${settle(html)}</div>`)
  if (page === shell) throw new Error('root container not found in index.html')

  if (seo) {
    const url = ORIGIN + seo.canonicalPath
    page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`)
    page = setTag(page, 'meta\\s+name="description"', 'content', seo.description)
    page = setTag(page, 'link\\s+rel="canonical"', 'href', url)
    page = setTag(page, 'meta\\s+property="og:title"', 'content', seo.title)
    page = setTag(page, 'meta\\s+property="og:description"', 'content', seo.description)
    page = setTag(page, 'meta\\s+property="og:url"', 'content', url)
    page = setTag(page, 'meta\\s+name="twitter:title"', 'content', seo.title)
    page = setTag(page, 'meta\\s+name="twitter:description"', 'content', seo.description)
  } else if (route !== '/') {
    throw new Error(`${route} rendered without calling useSeo()`)
  }

  const file = route === '/' ? path.join(dist, 'index.html') : path.join(dist, `${route.slice(1)}.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, page)
  count++
}

// The sitemap comes from the same route list, so it can never drift from what's prerendered.
const today = new Date().toISOString().slice(0, 10)
const priority = (r) => (r === '/' ? '1.0' : r.startsWith('/blog/') ? '0.7' : r === '/terms' || r === '/privacy' ? '0.3' : '0.8')
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map((r) => `  <url><loc>${ORIGIN}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod><priority>${priority(r)}</priority></url>`).join('\n')}
</urlset>
`
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)

console.log(`prerendered ${count} pages + sitemap.xml (${ROUTES.length} urls)`)
