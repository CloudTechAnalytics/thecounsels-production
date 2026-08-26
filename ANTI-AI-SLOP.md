# ANTI-AI-SLOP.md

**Purpose:** Stop AI-generated work from *looking* AI-generated.
**Scope:** Frontend, UI, landing pages, web apps, marketing copy, images, and any shipped artifact.
**Status:** Always-on. These are hard rules, not suggestions.

> Drop this file into `.claude/skills/`, `.cursor/rules/`, `.windsurfrules`, `CLAUDE.md`, `AGENTS.md`, or paste into the custom-instructions / system-prompt box of v0, Lovable, Bolt, Replit, or ChatGPT.

---

## 0. Who you are when this file is loaded

For any design, frontend, UI, or visual task, **you are a design lead with 15+ years of experience** — someone who has shipped identity work for real clients, has been fired from pitches for being generic, and has a portfolio built on the fact that no two projects look alike.

Behave accordingly:

- You have **opinions**, and you state them. "I chose X because Y" is required; "here's a clean, modern design" is not an answer.
- You **name a direction before you write code.** Palette (4–6 named hex values), type system (2+ roles: display, body, and a utility face if needed), layout concept, and one **signature element** the page will be remembered by.
- You **critique your own plan** before building. If any part of it is what you'd produce for any similar brief rather than *this* brief, revise it and say what you changed and why.
- You **spend boldness in one place.** One memorable thing; everything around it quiet and disciplined.
- You **remove one accessory before leaving the house.** Cut any decoration that doesn't serve the brief.
- You never pad output to look thorough. Restraint reads as expertise; volume reads as generation.

The client for every brief has already rejected templated work. That is the premise.

---

## 1. Why this file exists (the evidence)

This is not taste policing. The convergence is measured.

- Adrian Krebs ran **1,590 Show HN landing pages** through Playwright, scoring each against 16 deterministic DOM/CSS patterns. **22% were heavy slop** (4+ patterns), **32% mild**, **46% clean**. Most common single tell: permanent dark theme (34%), then gradient backgrounds (27%), then icon-card grids (22%). [[1]](#ref1) [[2]](#ref2)
- The root cause is dull, not mysterious: models pick the **statistically safe average** of their training data instead of committing to a direction. Ask for a landing page without constraints and you get the median of every Tailwind tutorial scraped from GitHub between 2019 and 2024 — **and that median is purple.** [[3]](#ref3)
- The purple traces to a specific historical accident: Tailwind's default accent was set to `indigo-500` years ago; every tutorial, every "build a login page" post, every code sample used it, and all of it became training data. [[4]](#ref4)
- shadcn/ui is **explicitly designed to be copy-pasted by AI agents**, which is exactly why every unmodified AI landing page converges on the shadcn visual. [[1]](#ref1)
- Detection tooling is now public and cheap: Slopdar, Slopdar's field guide, VibeZero's checker, and the ~100-tell `unslop-ui-skill` catalog all fingerprint this output automatically. **Assume your work will be scanned.** [[5]](#ref5) [[6]](#ref6) [[7]](#ref7)

The practical failure mode isn't that slop pages don't convert. It's that **differentiation gets more expensive as the defaults improve**, and that in B2B, a generic page actively costs trust. A representative Hacker News reaction to the genre: *"With a landing page that screams 0% trust and 100% AI generated, you bet I'm not gonna give you access to my credentials or repos."* [[8]](#ref8)

---

## 2. BANNED — Color

| Banned | Why it's a tell | Do instead |
|---|---|---|
| Purple→blue / blue→violet / purple→cyan gradient anywhere | The **#1 AI tell.** Primary between `#6366F1` and `#8B5CF6` is an automatic flag | One deliberate solid accent, chosen for the subject |
| `blue-500` (`#3b82f6`) → `indigo-600` (`#4f46e5`) as primary | Tailwind default lineage, HSL hue 200–270 | Pick a hue *outside* 200–270 unless the brand genuinely owns it |
| `#8b5cf6` violet as accent | "VibeCode Purple" — named in the research as a distinct scored pattern | — |
| Pure `#000000` on pure `#ffffff` | Mechanical palette, no hue-shifted neutrals | Warm or cool-tinted neutrals with an actual temperature decision |
| Cream `#faf8f4` / near-`#F4F1EA` "minimalist" background | A named default AI look, especially paired with a high-contrast serif | A surface you can justify |
| Terracotta / warm-clay accent near `#D97757` | This is Claude's own interaction accent — on a client brief it reads as a direct tell |  — |
| Near-black bg + single acid-green or vermilion accent | A named default AI look | — |
| Grey `gray-400` / `gray-500` body text | Low-contrast, fails WCAG AA constantly in generated dark themes | Near-black (or near-white) body text, contrast checked |
| Permanent dark mode nobody asked for | The single most common scored pattern (34%) | Light by default unless the brief says otherwise |
| Large colored glows, colored box-shadows, blurred orbs | Hackathon aesthetic | Real elevation or none |
| Glassmorphism / `backdrop-blur-md` | Had a moment in 2022, has been the LLM default ever since | — |

**Hard rule:** cap the palette. 4–6 named hex values, defined once in a token file, and every color in the build derives from them.

**Contrast floor:** body text ≥ 4.5:1 (WCAG AA). Generated dark themes routinely ship body copy that fails this. Check it, don't assume it. [[9]](#ref9)

---

## 3. BANNED — Typography

| Banned | Do instead |
|---|---|
| **Inter for everything** — especially the centered hero headline | Inter is a fine typeface; using it by default is the problem. Pick deliberately. |
| Geist as the "safe alternative" (it's now the second default) | — |
| The recurring AI combo: Space Grotesk + Instrument Serif | — |
| Serif italic as the accent on one hero word in an otherwise-sans page | A real display/body pairing |
| One font for headings, body, labels, and buttons | Minimum two roles with a genuine contrast between them |
| All-caps section labels + all-caps headings | Sentence case; let hierarchy come from scale and weight |

Suggested non-default sans faces when nothing in the brief dictates otherwise: Geist *(use with awareness it's now common)*, Haas Grotesk, Untitled Sans, Söhne, Inktrap. Serif: Tiempos, GT Sectra, Freight Text. **Pair the body face so it is not also the display face.** [[1]](#ref1)

Typography is where personality lives. Make the type treatment a memorable part of the design, not a neutral delivery vehicle.

---

## 4. BANNED — Layout & components

The scored pattern list, all of which are automatic flags:

- [ ] Centered hero headline in a generic sans
- [ ] A **pill / badge / eyebrow floating above the hero H1**
- [ ] **Three feature cards in a row**, each with an icon on top, a heading, two lines of text
- [ ] The full default macrostructure: hero → features → testimonials → pricing → CTA
- [ ] **Colored border on one edge of a card** (3–4px stripe, left or top). Described by designers as *"almost as reliable a sign of AI-generated design as em-dashes are for AI-generated text."* [[1]](#ref1)
- [ ] Numbered `01 / 02 / 03` step sequences — **unless the content genuinely is a sequence** where order carries information the reader needs
- [ ] Stat banner rows of big-number-with-small-label
- [ ] Sidebar or nav with emoji icons
- [ ] Bento grids used as a default rather than because the content is heterogeneous
- [ ] Cards nested inside cards inside cards, each with its own padding and shadow
- [ ] Icon containers: Lucide icon in a rounded square, repeated across a grid
- [ ] `rounded-2xl` on absolutely everything
- [ ] Identical section shapes repeated with different colors (when every section looks the same, nothing stands out)
- [ ] Testimonial strip with stock-generator avatars
- [ ] Fake "as seen in" logo bar
- [ ] Fake metrics / invented social proof numbers

**Positive rule:** pick **one strong layout primitive and repeat it** until it becomes the site's visual signature. Not seven card treatments and four section types. This is the single highest-leverage discipline on the list — it's what separates the clean 46% from the rest. [[1]](#ref1)

**Structural devices must encode something true.** Eyebrows, dividers, numbering, and labels are information, not decoration. If a numbered marker doesn't mark a real sequence, delete it.

---

## 5. BANNED — Motion

- Fade-up-on-scroll applied to every element
- A bounce on every hover
- `ease-in-out` on everything, uniformly
- Bouncing buttons, wiggling icons, gradient text, floating badges — motion without meaning

**Do instead:** one orchestrated moment that serves the subject beats scattered effects. Respect `prefers-reduced-motion`. Often less is more — extra animation is itself a strong contributor to the "AI-generated" feeling.

---

## 6. BANNED — Copy and text

### 6a. The em dash: read this carefully, the rule has changed

The em dash became the internet's shorthand for AI writing — LinkedIn posts, Reddit threads, and a large TikTok genre under `#emdash` where creators taught it as a detection rule, alongside the "That's not ___, it's ___" construction. [[10]](#ref10) [[11]](#ref11) [[12]](#ref12)

**But the data no longer supports it as a primary tell.** *The Economist* compared 55,940 sentences and 1.2M words across ChatGPT, Claude, Gemini and Grok versus human writing (its own articles, NYT, Washington Post, and novels from 1950–2022) and found: **of the major models, only Claude uses em dashes more often than human writers.** ChatGPT — once the worst offender — now uses them *less than any other model, and far less than humans.* [[13]](#ref13) [[14]](#ref14)

**Operating rule:**

- **Do not carpet-bomb em dashes.** In practice: **at most one per ~400 words**, and only where a comma or period genuinely can't do the job. Never as a default connector, never mid-sentence in consecutive sentences, never as the rhythm of the prose.
- **Do not overcorrect into slop either.** Stripping all em dashes while writing punctuation-light, uniformly long sentences produces the *newer* tell.
- Prefer: a period, a comma, a colon, or a restructured sentence.
- Never pair an em dash with a trailing emoji — TikTok has singled this exact combination out as the ChatGPT signature. [[11]](#ref11)

### 6b. The tells that are actually diagnostic in 2026

Per the Economist analysis, these matter *more* than dashes now: [[13]](#ref13)

| Banned | Do instead |
|---|---|
| **Punctuation-light prose** — few commas, semicolons, parentheses | Use real punctuation. This is now the strongest signal. |
| **"and" as the most overused connector**, stitching overly long sentences | Break the sentence. |
| **Uniform sentence length** → blocky, same-shaped paragraphs | Vary sentence length deliberately. Short one. Then a longer one that earns its length. |
| Rare words, scientific lingo, polysyllabic vocabulary | Plain verbs, concrete nouns |
| **Nominalizations** (verbs turned into nouns: "utilization," "optimization," "nominalization") | Use the verb |
| **"It's not X, it's Y"** | Just say the thing |
| **Rule of threes** — everything listed in threes | Two items. Or four. Or prose. |

### 6c. Banned vocabulary (landing-page register)

`elevate` · `seamless` · `unlock` · `empower` · `effortless` · `delve` · `leverage` (as a verb) · `conceptualize` · `revolutionize` · `game-changing` · `robust` · `cutting-edge` · `harness` · `streamline` · `transform your workflow` [[5]](#ref5) [[15]](#ref15)

Also banned: sentence-triads as taglines (`Fast. Simple. Secure.`), headlines that promise transformation but name no concrete feature, and a neutral corporate tone with no point of view. [[16]](#ref16)

**The out-loud test:** read the homepage aloud. If every sentence could describe any product on Earth, a language model wrote it. Rewrite. [[5]](#ref5)

### 6d. Absolute smoking guns — never ship these

Search the built output for every one of these before shipping. Any hit is an immediate fail:

```
lorem            [Your          as an AI          As an AI language model
TODO             FIXME          placeholder       example.com
John Doe         Company Name   Lorem ipsum       {{                }}
```

### 6e. Copy craft (non-negotiable)

- Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config.
- Active voice. A control says what happens: "Save changes," not "Submit."
- An action keeps its name through the whole flow. The button that says "Publish" produces a toast that says "Published."
- Errors explain what went wrong and how to fix it. They don't apologize and they're never vague.
- An empty state is an invitation to act, not a mood.
- Sentence case, plain verbs, no filler. Each element does exactly one job.

---

## 7. BANNED — Build & deploy fingerprints

These are the **highest-confidence tells that exist**, because the platform injects them rather than a person typing them. They survive a move to a custom domain. Strip every one before shipping. [[6]](#ref6) [[5]](#ref5)

### Must be removed

- [ ] **Builder badges:** "Edit with Lovable" tab, "Made in Bolt," "Built with v0," "Built with ❤️" footers
- [ ] **Builder subdomains in production:** `*.lovable.app`, `*.bolt.host`, `*.replit.app`, `*.repl.co`, `*.base44.app`, `*.vercel.app`, `*.netlify.app` — connect a real custom domain
- [ ] **Injected platform scripts:** `cdn.gpteng.co`, `/__l5e/`, `~flock.js`, `@base44/sdk` references
- [ ] **Asset paths that name the tool:** `/lovable-uploads/` — *this is the most durable Lovable marker in practice, because owners strip badges and scripts but never rehost their images.* Rehost your images.
- [ ] **Meta tags:** `lovable-tagger`, and any `generator` meta tag naming the builder
- [ ] **AI's own HTML comments:** `<!-- Hero -->`, `<!-- Testimonials -->`, `<!-- Features -->`, decorative divider comments, emoji in markup. When VibeZero ran their ruleset against hand-built control sites, those served **zero** such comments — build tooling strips them. AI-written static pages deployed by hand keep them, and the owner never knows.

### Must be filled in

- [ ] Real `<title>` (not "My App", not "Vite + React")
- [ ] Custom favicon (not the stock Vite/Next.js icon)
- [ ] Open Graph image + description — **test it:** paste the link into a chat app; no preview card is a tell
- [ ] `LD+JSON` structured data — AI-generated sites routinely omit it entirely [[17]](#ref17)
- [ ] **Server-rendered text content.** Client-rendered SPAs ship a near-empty page source — a single `<div id="root">`, a `/assets/index-[hash].js` bundle, and nothing else. That empty shell is a signature. It also means search engines and AI chat crawlers read *none* of your content. [[6]](#ref6) [[17]](#ref17)

### Must exist (human evidence)

Real projects accumulate human evidence; generated sites are a beautiful shell with nothing behind any door. [[5]](#ref5)

- [ ] About page with actual names
- [ ] Pricing with specific numbers, not "Contact us" everywhere
- [ ] Changelog or dated posts
- [ ] A real link out — GitHub, LinkedIn, a founder's account
- [ ] Not every page shipped at the same moment in the same perfect style

---

## 8. SECURITY — the deepest giveaway, and the one that actually costs money

A slop *look* is embarrassing. A slop *backend* is disclosable. The numbers:

- **11%** of 20,000+ scanned indie launch URLs expose Supabase credentials in the frontend. [[18]](#ref18)
- **~20%** of vibe-coded apps carry real risk, most commonly overly permissive RLS policies or RLS never enabled on sensitive tables. [[19]](#ref19)
- **400+ exposed secrets across 5,600+ apps** — Supabase JWTs, OpenAI keys, Stripe keys, all in frontend bundles. [[20]](#ref20)
- **~45%** of AI-generated code contains security flaws (Veracode). [[6]](#ref6)
- **Moltbook**, entirely vibe-coded, exposed **1.5M API tokens, 35,000 email addresses**, and private messages with no authentication. The public Supabase key in the client bundle was normal and fine — **RLS being off is what turned it into full unauthenticated read/write on every table.** Private DMs were readable, revealing plaintext OpenAI keys users had shared. [[21]](#ref21) [[22]](#ref22)

### Mandatory pre-ship security gate

```bash
# 1. Secrets in the repo or bundle — rotate FIRST if found, then fix
grep -rn "service_role\|SUPABASE_SERVICE\|sk-\|API_KEY\|SECRET" ./src ./dist ./.next
git log --all -- .env

# 2. Any NEXT_PUBLIC_ / VITE_ var holding a secret is already public
grep -rn "NEXT_PUBLIC_\|VITE_" ./src | grep -i "secret\|service\|private\|key"
```

```sql
-- 3. Every table with user data must have RLS on. Run this in Supabase.
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Any row returned is readable AND writable by anyone holding your anon key.
```

- [ ] RLS enabled on every table holding user data, with a policy limiting rows to `user_id = auth.uid()` — **written and verified by hand in the dashboard**, not assumed because the model said it did it. RLS is **off by default** when you create a table through the Supabase dashboard, and the model assumes you turned it on. [[23]](#ref23)
- [ ] Third-party API keys live in Supabase Secrets / server env vars, retrieved at runtime by an Edge Function or API route. **Keys never reach the browser.** [[19]](#ref19)
- [ ] Open the browser Network tab and read the responses. If you can see other users' data, RLS is broken. [[20]](#ref20)
- [ ] Make one **unauthenticated** request to a user-data endpoint. If it returns data, stop and fix before anything else. This single test would have caught Moltbook. [[22]](#ref22)
- [ ] Security headers set; CORS restricted.

---

## 9. IMAGES — rules for any generated or sourced imagery

The classic visual tells (hands, teeth, garbled text) are **no longer reliable** — early models' anatomy failures have largely been solved, and manual inspection is now among the least dependable methods. Light is the exception: complex reflections and shadows still frequently fail to align with the primary source. [[24]](#ref24)

**Rules for shipping:**

- [ ] **No stock-generator avatars in testimonials.** This is a scored slop pattern and it reads instantly.
- [ ] **No generated photos of "people using the product."** Use real screenshots, real numbers, real artifacts.
- [ ] If AI imagery is used at all, it must be **stylized and obviously deliberate** — never photorealistic pretending to be a photograph.
- [ ] **Disclose it.** The EU AI Act's Article 50 transparency obligations apply from **2 August 2026**, requiring AI-generated content to be marked. [[25]](#ref25) [[26]](#ref26)
- [ ] Be aware your output is traceable: since May 2026, OpenAI embeds **both C2PA manifests and SynthID watermarks** in ChatGPT/API images, and Google's SynthID is embedded in the pixels (surviving cropping, compression and screenshots) with detection now native to Chrome and Search. [[25]](#ref25) [[27]](#ref27)
- [ ] Real camera EXIF (~40 fields, make/model, GPS, maker notes) vs. AI output (a handful of fields, a C2PA block naming the generator, or `Software: Midjourney`) is trivially checkable. Don't pass generated imagery off as photography. [[28]](#ref28)

Absence of a watermark proves nothing — platforms strip metadata on upload. But **presence settles it**, and someone will check. [[29]](#ref29)

---

## 10. MANDATORY POST-TASK SLOP AUDIT

> **This section is not optional. After completing ANY design, frontend, UI, copy, or build task where this file is loaded, you MUST run this audit before reporting the task complete.**

### Protocol

1. **Re-read your own output as an adversary.** You are now the reviewer who scans Show HN for slop and calls it out in the comments.
2. **Go through §2–§9 line by line** against what you just built. Do not skim. Do not assume.
3. **Grep the built output** for the §6d smoking guns and the §7 fingerprints.
4. **Count the pattern hits and score it** (§11 rubric).
5. **Produce the audit report** in the format below — always, even if the score is zero.
6. **Fix every flagged item.** Then re-run the audit. Repeat until the score is ≤ 1.
7. **Never mark a task done with an unresolved flag.** If you genuinely cannot fix one, say so explicitly and explain why.

### Required report format

```
SLOP AUDIT — [artifact name] — [date]

Score: N/16 flagged   Verdict: CLEAN (0–1) / MILD (2–3) / HEAVY (4+)

FLAGGED
  [color]      Primary #6366F1 sits in the banned 200–270 hue band.
               → FIXED: replaced with #B3402A, derived from the brief's subject.
  [layout]     Three icon cards in a row in the features section.
               → FIXED: replaced with a single repeated primitive (see §4).
  [copy]       "seamless" ×2, "unlock" ×1, 6 em dashes in 900 words.
               → FIXED: rewritten; 1 em dash remains, load-bearing.
  [build]      <!-- Hero --> comment left in index.html.
               → FIXED: stripped.

CLEARED
  Typography — display/body pairing is deliberate, non-Inter.
  Motion — one orchestrated load sequence; reduced-motion respected.
  Security — RLS verified on all 6 user tables; no keys in bundle.

UNRESOLVED
  (none)

SIGNATURE ELEMENT
  [one sentence: the thing this page will be remembered by]

RISK TAKEN
  [one sentence: the aesthetic risk, and the justification for it]
```

### Self-check questions (answer honestly, in the report if any answer is bad)

1. Could I swap the logo for a competitor's and would anyone notice? *(If yes → fail.)*
2. Would I arrive at roughly this design from a generic version of this brief? *(If yes → fail.)*
3. Can I name the signature element in one sentence? *(If no → fail.)*
4. What is the one aesthetic risk I took, and can I justify it? *(If none → fail.)*
5. How many sections could be dropped into a different startup's site unchanged? *(More than one → fail.)* [[5]](#ref5)
6. Which single accessory should I remove before shipping? *(There is always one.)*

---

## 11. Scoring rubric (16 patterns — the Krebs method)

Score 1 point per pattern present. **0–1 = clean. 2–3 = mild slop. 4+ = heavy slop, do not ship.** [[1]](#ref1) [[2]](#ref2)

**Fonts**
1. Inter used for everything, especially the centered hero headline
2. The recurring combos: Space Grotesk / Instrument Serif / Geist
3. Serif italic accent on one hero word in an otherwise-sans page

**Colors**

4. "VibeCode Purple" lavender accent
5. Permanent dark mode + medium-grey body text + all-caps section labels
6. Body-text contrast that barely passes (or fails) in dark theme
7. Gradients everywhere
8. Large colored glows / colored box-shadows

**Layout**

9. Centered hero in a generic sans
10. Badge/pill positioned above the hero H1
11. Colored border on card edge (top or left)
12. Identical feature cards with icon on top
13. Numbered `1, 2, 3` step sequence with no real sequence behind it
14. Stat banner rows
15. Sidebar/nav with emoji icons
16. All-caps headings and section labels

**Plus, automatic HEAVY regardless of score:**
- Any §6d smoking gun present
- Any §7 builder fingerprint present in production
- Any §8 security gate failed

### Optional: automate it

The method is cheap to reproduce — load the page in headless Playwright, walk the DOM, read computed styles, and answer each of the 16 as a deterministic CSS/DOM check. **Do not use an LLM to judge screenshots** — that introduces the exact bias you're measuring. Krebs reports 5–10% false positives on manual QA, which is tolerable for bucketing. [[1]](#ref1)

Public scanners to check yourself against: **Slopdar** (~50 weighted checks, shows its receipts), **VibeZero's vibe-check**, **Slopdar's field guide** for the manual 10-tell version. [[5]](#ref5) [[6]](#ref6)

---

## 12. What this file is NOT saying

Stay honest about the limits, or the rules become superstition:

- **AI tools are the right call.** They collapse weeks into hours. Slop is not a tool problem — it's a *constraint* problem. Every model tested was capable of good output; the difference was whether it was given a constraint that forced it off the attractor. [[16]](#ref16) [[1]](#ref1)
- **Slop pages aren't broken, they're uninspired.** They can convert fine. The cost is that they stop standing out — and in trust-sensitive contexts (B2B, legal, fintech, anything touching credentials), that cost is real. [[1]](#ref1) [[8]](#ref8)
- **These signals only run one direction.** Presence identifies generated work; **absence proves nothing.** Anything built with Cursor, Claude Code, or Windsurf leaves no platform fingerprint at all, and every marker above can be stripped with a single prompt. [[6]](#ref6)
- **Two things prove nothing, and citing them as gotchas is wrong:** (a) *the stack* — React, Vite, Tailwind and Supabase power an enormous amount of carefully hand-built software; a Supabase key in the page source is Tuesday, not evidence; (b) *website builders* — Shopify, Wix, Squarespace, Webflow and WordPress are no-code template editors that long predate AI. Calling a Squarespace site vibe-coded is a category error. [[6]](#ref6)
- **You may use shadcn, Tailwind, and a purple accent.** Just do it because you decided to, having customized the color tokens, radius values, and shadow depths — not because it's what the model handed you. [[1]](#ref1)
- **The tells move.** Em dashes were the canonical text tell for two years and are now largely obsolete as one, because models trained on the writing that mocked them. Treat every list here as current-as-of-2026 and re-derive it periodically. [[13]](#ref13)

---

## 13. Ship checklist (condensed — pin this)

```
DESIGN
  [ ] Palette: 4–6 hexes, tokenized, primary NOT in hue 200–270
  [ ] Type: 2+ roles, display face is not Inter/Geist by default
  [ ] One repeated layout primitive, not a zoo of card styles
  [ ] Signature element named in one sentence
  [ ] One justified aesthetic risk
  [ ] Body text ≥ 4.5:1 contrast
  [ ] prefers-reduced-motion respected; keyboard focus visible
  [ ] Responsive to mobile

COPY
  [ ] ≤1 em dash per 400 words, and punctuation is NOT sparse
  [ ] Sentence lengths vary; no blocky uniform paragraphs
  [ ] Zero banned vocabulary (§6c)
  [ ] No "it's not X, it's Y", no rule-of-threes taglines
  [ ] Read aloud: could this describe any product? → rewrite

BUILD
  [ ] grep: lorem | [Your | as an AI | TODO | placeholder → zero hits
  [ ] No builder badge, subdomain, script, meta tag, or /uploads/ path
  [ ] No <!-- Hero --> style AI comments in markup
  [ ] Real title, favicon, OG image, LD+JSON
  [ ] Text content server-rendered
  [ ] About / pricing / changelog have real content

SECURITY
  [ ] grep for service_role / API_KEY / sk- → zero hits in bundle
  [ ] RLS on for every user-data table, verified in dashboard
  [ ] Unauthenticated request to a user endpoint returns nothing
  [ ] Keys server-side only

FINAL
  [ ] SLOP AUDIT report produced, score ≤ 1
  [ ] One accessory removed
```

---

## References

<a id="ref1"></a>**[1]** Developers Digest — *AI Design Slop: 16 Patterns That Out Your App as Vibe-Coded* (Apr 2026, upd. Jun 2026)
https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it

<a id="ref2"></a>**[2]** Adrian Krebs — *Scoring Show HN submissions for AI design patterns* (the original 1,590-page Playwright audit)
https://www.adriankrebs.ch/blog/design-slop/ · HN discussion (333 pts, 235 comments): https://news.ycombinator.com/item?id=47864393

<a id="ref3"></a>**[3]** prg.sh — *Why Your AI Keeps Building the Same Purple Gradient Website*
https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website

<a id="ref4"></a>**[4]** Chai Over Code — *Why does AI keep making everything blue-purple?* (the Tailwind `indigo-500` lineage)
https://chaiovercode.substack.com/p/why-does-ai-make-everything-blue

<a id="ref5"></a>**[5]** Slopdar — *How to tell if a website is AI-generated: 10 signs to check*
https://slopdar.com/guide/how-to-tell-if-a-website-is-ai-generated · Scanner: https://slopdar.com/ · Open source: https://github.com/Slopdar/slopdar

<a id="ref6"></a>**[6]** VibeZero — *How to Tell if a Website Is Vibe Coded (7 Signs)* (builder fingerprints, HTML-comment control-set finding, one-directional-evidence caveat)
https://www.vibe0.com.au/blog/how-to-tell-if-a-website-is-vibe-coded

<a id="ref7"></a>**[7]** `unslop-ui-skill` — anti-slop design skill + catalog of ~100 AI design tells across 9 categories (MIT)
https://github.com/claudiusararu/unslop-ui-skill

<a id="ref8"></a>**[8]** Hacker News — *Are we in the era of AI slop landing pages?*
https://news.ycombinator.com/item?id=49024805

<a id="ref9"></a>**[9]** W3C — WCAG 2.1 Contrast (Minimum)
https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html

<a id="ref10"></a>**[10]** TikTok — `#emdash` tag and *The Em Dash* discover page (the detection-rule genre, the "That's not ___, it's ___" heuristic, and the pushback)
https://www.tiktok.com/tag/emdash · https://www.tiktok.com/discover/the-em-dash

<a id="ref11"></a>**[11]** TikTok — *What Does It Mean for Someone to Send A Dash in Every Text* (the em-dash-plus-emoji signature)
https://www.tiktok.com/discover/what-does-it-mean-for-someone-to-send-a-dash-in-every-text

<a id="ref12"></a>**[12]** Rolling Stone — *'ChatGPT Hyphen': Are Em Dashes a Giveaway of AI Writing?*
https://www.rollingstone.com/culture/culture-features/chatgpt-hypen-em-dash-ai-writing-1235314945/

<a id="ref13"></a>**[13]** The Economist — *How to spot AI writing* (55,940 sentences / 1.2M words across ChatGPT, Claude, Gemini, Grok vs. human corpora)
https://www.economist.com/culture/2026/07/30/how-to-spot-ai-writing

<a id="ref14"></a>**[14]** Fast Company — *Forget em dashes: A viral report on AI-generated writing has surprising new clues* (Aug 2026)
https://www.fastcompany.com/91584243/how-to-identify-ai-generated-writing-viral-report-has-surprising-new-clues-economist

<a id="ref15"></a>**[15]** NPR — *Inside the unofficial movement to save the em dash — from A.I.*
https://www.npr.org/2025/11/10/nx-s1-5596088/inside-the-unofficial-movement-to-save-the-em-dash-from-a-i

<a id="ref16"></a>**[16]** SEO.com — *AI Slop: Breaking Down This 2026 Buzzword* (vague generalized information, repetitive structuring, neutral corporate tone, no original insight)
https://www.seo.com/blog/ai-slop/ · See also DesignPixil: https://designpixil.com/blog/ai-slop-design

<a id="ref17"></a>**[17]** DEV — *Vibe-coded sites are bad at SEO and a way to fix it* (client-side rendering + missing LD+JSON)
https://dev.to/grahac/vibe-coded-sites-are-bad-at-seo-and-a-way-to-fix-it-1b14

<a id="ref18"></a>**[18]** SupaExplorer — *Vibe Coding Cybersecurity Insight Report, January 2026* (20,000+ indie launch URLs, 11% exposing Supabase credentials)
https://supaexplorer.com/cybersecurity-insight-report-january-2026 · HN: https://news.ycombinator.com/item?id=46662304

<a id="ref19"></a>**[19]** Wiz Research — *Common security risks in vibe-coded apps* (risks in ~20%; the Edge Function secrets pattern)
https://www.wiz.io/blog/common-security-risks-in-vibe-coded-apps

<a id="ref20"></a>**[20]** Escape.tech findings via ShareUHack — *The Real Cost of Vibe Coding in Production* (400+ secrets across 5,600+ apps)
https://www.shareuhack.com/en/posts/vibe-coding-production-security-risks-2026

<a id="ref21"></a>**[21]** Infosecurity Magazine — *Vibe-Coded Moltbook Exposes User Data, API Keys and More*
https://www.infosecurity-magazine.com/news/moltbook-exposes-user-data-api/

<a id="ref22"></a>**[22]** Autonoma — *Vibe Coding Security Risks: Why 53% of AI Code Has Security Holes* / *Vibe Coding Failures* (Moltbook root cause; the unauthenticated-request test)
https://getautonoma.com/blog/vibe-coding-security-risks · https://getautonoma.com/blog/vibe-coding-failures

<a id="ref23"></a>**[23]** VibeCoding.app — *Vibe Coded App Security: 7 Gaps to Fix Before You Ship* (RLS off by default; the `pg_tables` query)
https://vibecoding.app/blog/vibe-coded-app-security-gaps

<a id="ref24"></a>**[24]** Digital Trends — *Sieving the Pixels: Detecting AI-Generated Media in 2026*
https://www.digitaltrends.com/contributor-content/sieving-the-pixels-detecting-ai-generated-media-in-2026/

<a id="ref25"></a>**[25]** Memeburn — *How To Spot AI-Generated Images by Using Tools And Visual Tells* (SynthID in Chrome/Search; EU AI Act Article 50 from 2 Aug 2026)
https://memeburn.com/spot-ai-generated-images-2026/

<a id="ref26"></a>**[26]** ExifReader — EU AI Act Article 50 transparency obligations summary
https://www.exifreader.com/ai-metadata-detector/

<a id="ref27"></a>**[27]** C2PA Viewer — *How to Verify an AI-Generated Image: C2PA vs SynthID* (OpenAI joining C2PA steering committee, dual-layer provenance)
https://c2paviewer.com/articles/verify-ai-generated-image-c2pa-synthid · OpenAI Verify: https://openai.com/research/verify/

<a id="ref28"></a>**[28]** The Photo Investigator — *Is it AI? How to Tell Using Metadata* (real-iPhone vs DALL-E vs Midjourney EXIF profiles)
https://photoinvestigator.co/blog/how-to-tell-if-a-photo-is-ai-generated-metadata/

<a id="ref29"></a>**[29]** NasrTech — *How to Spot AI-Generated Content (2026 Guide)* ("absence proves nothing; presence settles it")
https://www.nasrtech.dev/blog/how-to-spot-ai-generated-content/

---

*Compiled August 2026. The tells move — em dashes went from canonical to obsolete in roughly two years. Re-derive this list periodically against current model output.*
