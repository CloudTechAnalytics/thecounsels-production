# The Counsel — Architecture & Developer Handoff

This document is for a developer who is new to this codebase and needs to understand how it fits together — not a marketing overview (see `README.md` for that) and not a getting-started guide (also in `README.md`). This is the map: what exists, why it's shaped this way, and the specific gotchas that will bite you if you don't know them going in.

**Last updated:** against migration `0109`, both environments (Testing/Production) fully deployed and in sync at that point.

---

## 1. What this is

**The Counsel** is a multi-tenant SaaS for law firms (case/matter management, billing, HR, documents, calendar, messaging), built and operated by **CloudTech Analytics**. Two completely separate experiences live in one codebase:

| | Who | Routes |
|---|---|---|
| **Platform Console** | CloudTech staff only | `/platform/*` |
| **Firm Workspace** | A law firm's own team | everything else |

A platform admin never sees a firm's data; a firm user never sees the console. Routing switches the entire layout based on identity (`src/app/router.tsx`).

## 2. Tech stack

- **React 19 + TypeScript (strict) + Vite 6**
- **React Router 6**, **TanStack Query** (all server state — no separate global state library), **React Hook Form + Zod** (every form)
- **Tailwind CSS + shadcn/ui-style primitives** (`src/shared/components/ui/`) + Framer Motion
- **Supabase**: Postgres + Row-Level Security + Storage + Realtime + Auth + Edge Functions + `pg_cron`/`pg_net`. **There is no custom backend server.** Every rule (multi-tenancy, permissions, billing state, plan gating) is enforced in Postgres via RLS and `security definer` functions, not in application code. The frontend is a thin client over Supabase; if you're looking for "the backend," it's `supabase/migrations/`.
- **Paystack** for billing (Nigerian Naira), **Resend** for transactional email, **Google Gemini** for AI features.

A `server/` directory exists in the repo (Express + SQLite) — this is a **retired, legacy backend**, explicitly superseded by Supabase (see its own `.gitignore` comment). It still has a CI job but nothing in the live app talks to it. Don't be misled by its presence.

## 3. Repo / branch / environment layout

This is not a typical single-repo, single-environment project. Read this section before touching anything infrastructure-related.

- **Three separate GitHub repos**, not branches-in-one-repo for the main split:
  - `CloudTechAnalytics/thecounsels-testing` — Testing environment. Single branch: `testing`.
  - `CloudTechAnalytics/thecounsels-production` — Production environment, live at **thecounsels.org**. Single branch: `production`.
  - A third, older personal repo (`johndave74/thecounsel`, remote name `personal` in a typical local checkout) still exists with its own `main`/`develop`/`staging` branches from before the CloudTechAnalytics migration — **effectively retired**, not part of the live deploy pipeline. Don't push there for real work; it's just still sitting there pending archival.
- **Two separate Supabase projects** — genuinely separate databases, not schemas:
  - Testing: project ref `qhuiwismwvjardpuzssc`
  - Production: project ref `vxrdfdciuzvjrjzmmefq`
- **Workflow**: develop against Testing, verify, then fast-forward the same commit into `production` and re-run the same migration against the Production project. Every migration this project has ever shipped went through this two-step process — Testing first, always, no exceptions, because a bad migration (especially anything touching RLS or a trigger on a hot table) has a much bigger blast radius on Production.
- **Deploying a migration** (from a local checkout, `supabase` CLI, no local Docker/Postgres needed):
  ```bash
  npx supabase link --project-ref <testing-or-production-ref>
  npx supabase db push
  ```
  Migrations are plain numbered SQL files in `supabase/migrations/`, applied in order, tracked in `supabase_migrations.schema_migrations` on each project independently. **Migration numbers must be globally unique across the whole file set** — a duplicate number caused a real outage-adjacent incident once (`db push` uses the numeric prefix as its version key; a collision breaks the tracking table). Always check `ls supabase/migrations | sort | tail` before naming a new one.
- **Edge Functions** deploy the same way, per project:
  ```bash
  npx supabase functions deploy <name> --project-ref <ref>
  ```
  Two functions specifically require `--no-verify-jwt` because they're never called with a normal user session — see §7.
- **Vercel**: two separate Vercel projects (`thecounsels-testing`, `thecounsels-production`), each with its own env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` — the last one must be the **live** key on Production, **test** key on Testing, matching whichever `PAYSTACK_SECRET_KEY` each Supabase project has). Each project's **Production Branch** setting must point at that repo's single branch (`testing`/`production`) — this has been misconfigured before (silently pointed at a branch that no longer existed, serving a stale build indefinitely with no error).
- **Domain**: `thecounsels.org`, DNS on Cloudflare (proxy/orange-cloud **off** on the records pointing at Vercel — Cloudflare's proxy breaks Vercel's own SSL verification).

## 4. Multi-tenancy & security model

Every tenant-scoped table carries `organization_id`. **RLS is the actual security boundary** — the frontend hiding a button is a UX nicety, never the real gate. Core helper functions (`security definer`, in `public` schema, used throughout every migration):

- `has_permission(org, perm_key)` — does the caller's role in this org have this permission key?
- `is_org_member(org)` / `is_org_admin(org)` / `is_platform_admin()`
- `has_matter_access(matter_id)` — narrower than `matters.view`: also requires being org-admin, having `matters.view_all`, being the lead lawyer, the creator, or an explicit `matter_assignments` row.
- `has_task_access(task_id)` (added migration `0109`) — deliberately a plain **OR**, not matters' AND-gated shape: `has_permission(org,'tasks.view') OR assignee_id=auth.uid() OR created_by=auth.uid()`. Mirrors `tasks_update`'s own existing bypass, not `has_matter_access`'s stricter one — these two patterns exist side by side in this codebase for different reasons, don't assume they're interchangeable.
- `matter_is_open(matter_id)` — a matter with status `closed`/`won`/`lost` is read-only. This is the single convention behind almost every "why can't I edit this" question in this app: **closed matters block all NEW writes** (documents, tasks, hearings, time entries, expenses, notes, AI chat) but stay **fully readable forever**. The one way out of a closed matter is `reopen_matter()`, a dedicated RPC — a plain `UPDATE` on `matters` is RLS-blocked outright once closed (see `matters_update` policy, migration `0050`), which is why the frontend's "quick status change" control (`matter-status-menu.tsx`) has to branch between a plain status patch and the reopen RPC rather than treating status as one uniform field.
- `org_has_feature(org, feature_key)` — plan-based feature gating (messaging / whatsapp_reminders / hr_module / ai_summarization), enforced at the INSERT/RPC boundary only, never on SELECT — same "gate creation, not historical read" philosophy as closed matters.

**Roles** (`RoleKey` in `src/shared/types/database.types.ts`): `platform_owner`, `platform_admin` (platform-side); `managing_partner`, `partner`, `senior_associate`, `associate`, `junior_associate`, `paralegal`, `finance`, `hr`, `secretary`, `receptionist`, `litigation_clerk`, `hr_administrator`, `hr_manager`, `hr_officer` (firm-side). Permissions are granular keys (`matters.create`, `documents.upload`, `hr_documents.manage`, ...) attached to roles via `role_permissions` — see `src/shared/lib/permissions.ts` for the full key list. Frontend gating: `usePermissions().has(key)` + `<RequirePermission>` route guard; plan gating: `usePlanFeature` + `<RequirePlanFeature>`.

**Storage** (Supabase Storage buckets, all path-scoped `organization_id/...` as the first folder segment, checked via `(storage.foldername(name))[1])::uuid` in bucket policies): `documents` (private — matter/general docs), `receipts` (private — expense receipts), `hr-documents` (private — employee HR docs), `avatars` (public, small), `org-logos` (public, small). Org-level storage **quota** (added migration `0108`) is computed **live** by summing `size_bytes` across the three private-bucket-backed tables — deliberately not a maintained counter (see §8).

## 5. Feature-based frontend structure

```
src/
  app/            router.tsx (all routing + permission/plan gates), layout wiring
  features/<name>/
    components/   feature-local UI
    hooks/        TanStack Query hooks (one file per feature, e.g. use-tasks.ts)
    services/     the only place that calls supabase.from()/rpc() directly
    pages/        route-level components
    types.ts      row types + _META display maps (labels/badge variants) + small pure helpers
    schemas.ts     zod schemas for forms
  shared/
    components/ui/   design-system primitives (Button, Card, Badge, DropdownMenu, ...)
    components/       cross-feature composite components (StatusBadgeMenu, ConfirmDialog, PageHeader...)
    hooks/            cross-feature hooks (rare — most hooks live in their own feature)
    services/         cross-feature services (rare — same reasoning)
    lib/              format.ts, errors.ts, permissions.ts, supabase.ts (the one Supabase client instance), utils.ts
    types/database.types.ts   HAND-AUTHORED Supabase types (see §9 — do not trust this file blindly)
supabase/
  migrations/     the real source of truth for the entire backend, strictly sequential
  functions/      Edge Functions (Deno runtime — not covered by tsconfig.app.json / tsc / npm run build)
```

Current feature list: `administration`, `auth`, `billing`, `calendar`, `clients`, `dashboard`, `documents`, `hearings`, `hr`, `landing`, `matters`, `messaging`, `notifications`, `onboarding`, `platform`, `reports`, `search`, `settings`, `staff`, `subscription-billing`, `support`, `tasks`.

**Convention**: a `service` function never returns raw Supabase response shapes to a component — it maps to a typed row interface. A `hook` never calls `supabase` directly — always through its feature's service. A `page` composes hooks + components; it doesn't contain query logic itself. This is consistent almost everywhere; if you find an exception, it's probably a bug waiting to be normalized, not an intentional pattern.

## 6. Detail-page pattern

Three entities have a `/thing/:id` detail page, all following the same shape (`matter-detail-page.tsx` is the original, most elaborate one — the other two are deliberately lighter):

- **Matters** (`/matters/:id`) — full tabbed page: Overview, Timeline, Hearings, Tasks, Documents, Notes, AI Chat (plan-gated). The template every other detail page borrows from.
- **Tasks** (`/tasks/:id`) — no tabs (a task is a small entity): info card + a reply thread (`task_comments`, migration `0109`) reusing the Communication Hub's `MessageThread`/`MessageComposer` components verbatim.
- **Clients** (`/clients/:id`) — tabbed: Overview (+ contacts), Matters, Billing, Documents. Documents has no direct `client_id` column anywhere — a client's documents are `documents` joined through `matters.client_id`, computed fresh each time, not cached.

All three reuse the same list-row → `navigate(...)` click pattern with `stopPropagation()` on any nested interactive control (checkbox, dropdown trigger, inline link) so those don't also trigger navigation.

## 7. Edge Functions (`supabase/functions/`)

| Function | Called by | `--no-verify-jwt`? |
|---|---|---|
| `admin-create-user` | Browser (admin flows) | No |
| `admin-reset-password` | Browser (admin flows) | No |
| `chat-with-matter` | Browser (matter AI chat) | No |
| `hard-delete-organization` | Browser (platform console) | No |
| `paystack-init-transaction` | Browser (checkout/upgrade) | No |
| `paystack-webhook` | **Paystack's servers directly** | **Yes** — authenticated via HMAC signature verification inside the function, not a Supabase session |
| `send-task-notification` | **`pg_net` from inside Postgres** (cron jobs) | **Yes** — called with a service-role bearer token, no user session exists |
| `summarize-matter` | Browser (AI matter summary) | No |

Getting the `--no-verify-jwt` flag wrong on the two that need it is a real, already-hit failure mode: without it, Supabase's gateway rejects the caller before the function's own code ever runs, and — critically — **the rejection doesn't show up in the function's own logs at all**, making it look like the caller (Paystack, `pg_net`) simply never tried. If a webhook/reminder appears to silently do nothing, check this first.

Gemini model: use the `-latest` alias (`gemini-flash-latest`), never a dated model string — Google periodically retires those with no compile-time warning, only a runtime API error. Also set `thinkingConfig: { thinkingBudget: 0 }` — recent Gemini models spend the `maxOutputTokens` budget on invisible "thinking" tokens by default, which can silently eat the entire budget before any visible output is produced.

## 8. Scheduled jobs (`pg_cron` + `pg_net`)

Three jobs, all defined via `cron.schedule(...)` inside migrations (search `supabase/migrations` for `cron.schedule` to find them):

- `daily-subscription-checks` (6am UTC daily) — trial reminders/expiry, scheduled plan downgrades taking effect, past-due → suspended after a grace window.
- `task-reminders` (hourly) — due-soon/overdue task notifications.
- `hearing-reminders` (hourly, `:05`) — 24h/1h-before hearing notifications.

Both reminder engines read the service-role key from **Supabase Vault** (`vault.decrypted_secrets`), not `ALTER DATABASE ... SET` — hosted Supabase's SQL editor role isn't a true superuser, so `ALTER DATABASE` for custom settings is flatly rejected. Vault is writable from the SQL editor and is the correct mechanism here. Each project needs its own `service_role_key` and `project_url` secrets seeded once via `select vault.create_secret(value, name)` — this is **not** part of any migration (can't be, the value is per-project and is a real secret), it's a manual one-time step per environment, easy to forget when standing up a new environment from scratch.

**WhatsApp reminders are not actually implemented** — the provider is a no-op stub. Email-only in practice today, regardless of what `notification_preferences` or plan features claim.

## 9. The hand-authored `database.types.ts`

There is no live local Supabase instance backing this project day-to-day, so `src/shared/types/database.types.ts` is **hand-maintained**, not generated (`npm run db:types` exists and would regenerate it correctly, but only against a linked local instance, which isn't part of the normal workflow here). **Every new table, column, or RPC function added in a migration must be manually mirrored into this file**, or the frontend won't compile against it — this has been the single most common last-mile step forgotten this project's history. If you add a Postgres function called via `.rpc(...)`, it needs an entry under `Database['public']['Functions']`; if you add a table, it needs a full `Row`/`Insert`/`Update`/`Relationships` block, matching the exact shape of neighboring tables (copy the closest existing one, don't write from scratch).

## 10. Known gotcha classes (found and fixed multiple times — know these before you go looking for "why is this broken")

- **PostgREST ambiguous-FK-embed**: a table with 2+ foreign keys into the same target table (e.g. `matter_assignments` → `profiles` via both `user_id` and `assigned_by`) makes an unqualified embed (`user:profiles(...)`) fail *silently* — PostgREST returns an error, but if the calling code doesn't explicitly check for it, the UI just shows an empty result with no visible error anywhere. Fix: qualify the embed with the FK name (`profiles!matter_assignments_user_id_fkey(...)`).
- **CASE-expression-to-enum casting gap**: `CASE WHEN ... THEN 'x' ELSE 'y' END` with only string literals resolves to Postgres type `text`, not the flexible "unknown" a bare literal gets — and `text` can't implicitly cast to a custom enum during function-argument resolution. Postgres reports the whole function call as "does not exist" rather than a specific cast error, which is a very confusing error to debug blind. Fix: explicit `::the_enum_type` casts on every argument passed into anything expecting an enum.
- **`err instanceof Error ? err.message : undefined`**: Supabase/PostgREST errors are plain objects, never real `Error` instances — this extremely common-looking pattern silently discards the actual error message every time. `src/shared/lib/errors.ts` exports `errorMessage()` (and `friendlyErrorMessage()`, which also translates raw RLS-violation text into plain English) specifically to fix this. **This pattern still exists in a large number of files across the codebase** — it was fixed opportunistically wherever a file was already being touched for something else, never swept comprehensively. Treat any file using the raw pattern as a small, safe, standalone cleanup opportunity.
- **Live computation over maintained counters**: `organizations.storage_used_bytes` is a real column that has existed since the very first billing migration and has *never* been written to — a maintained counter that nothing ever updates just silently drifts to being permanently wrong. The established fix pattern in this codebase (applied for storage usage, and matches how seat counts and billing dates were separately fixed) is: **compute the real number live from the actual source rows**, wrapped in a `security definer` function so RLS-partial visibility doesn't produce an incomplete sum. Don't add a new "cache the count in a column" pattern without a very good reason — this codebase has hit that exact bug three separate times.
- **Testing vs Production drift**: because there are two entirely separate Supabase projects, a secret set on one is *not* set on the other — this has caused real, confusing bugs (a hardcoded URL pointing at a since-retired original project, a Paystack key left as a literal placeholder string, a Vault secret set on one project but not the other). When debugging "works on Testing, broken on Production" or vice versa, check secrets/Vault parity before assuming a code bug.

## 11. Billing

Paystack, Naira. Flow: `paystack-init-transaction` (Edge Function) starts a checkout → user pays on Paystack's hosted page → `paystack-webhook` (server-side, signature-verified, the **only** place a subscription is ever marked active) flips `subscriptions.status`. The frontend's post-checkout page only ever polls and reflects what the webhook already wrote — it never marks anything active itself. Self-service trial signups are capped to a single fixed safe plan (`registration_settings.trial_plan_id`, falling back to Professional) regardless of which plan tier was clicked during signup, specifically to prevent picking an expensive tier and abandoning checkout as a way to get it for free (migration `0104`).

Enterprise plan pricing is deliberately **not shown publicly** anywhere (no "starting from ₦X" figure) — it's fully negotiated per company, provisioned via the Platform Console's custom-plan tooling.

## 12. What a new developer should probably do first

1. Read this file, then skim `README.md` for local setup.
2. Read `supabase/migrations/0001_core_multitenancy.sql` through `0002`/`0003` to see the actual multi-tenancy + permission model from its origin — everything else builds on this.
3. Pick one feature folder (`tasks` is a good, small, complete example) and read `types.ts` → `services/` → `hooks/` → `pages/` in that order to see the full convention end to end.
4. Skim migration filenames in order — the names themselves are a fairly readable changelog of the product's own history.

## Honest gaps (not hidden, just not yet done)

- The `err instanceof Error` anti-pattern sweep (§10) is incomplete across the codebase.
- WhatsApp reminders are unimplemented (no-op provider stub).
- No automated test suite for the frontend (the `server/` directory's Vitest suite is for the retired legacy backend only).
- The main JS bundle exceeds Vite's 500kB chunk-size warning threshold — not yet code-split.
