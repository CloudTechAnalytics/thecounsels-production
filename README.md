# CloudTech Legal Suite — The Counsel

**Enterprise, multi-tenant legal practice management platform.**

The Counsel is a production-grade SaaS for law firms — comparable in ambition to Clio, PracticePanther, MyCase and Litify — built on a fully **Supabase** backend (PostgreSQL + Row Level Security + Storage + Realtime + Edge Functions). There is no custom REST/Express server; every tenant's data is isolated and enforced at the database with RLS.

The product has **two completely separate experiences**:

| | Who | Purpose |
|---|---|---|
| **CloudTech Platform Console** | CloudTech staff (Platform Owner/Admin) | Manage the SaaS: organizations, subscriptions, plans, billing, analytics, audit — *never* a firm's legal data. |
| **Organization Workspace** | A law firm's own team | Run the practice: matters, clients, documents, hearings, calendar, tasks, staff. |

Routing switches layout by identity: a Platform Admin only ever sees `/platform/*`; a firm user only ever sees the workspace. No shared sidebar, no data leakage.

---

## Tech stack

- **React 19** + **TypeScript** + **Vite 6**
- **React Router**, **TanStack Query** (server state), **React Hook Form** + **Zod** (forms/validation)
- **Tailwind CSS** + **shadcn/ui** + **Framer Motion**
- **Supabase** — PostgreSQL, Auth, Storage, Row Level Security, Database Functions, Realtime, and Edge Functions only where a service role is required

**Design language:** editorial-prestige enterprise — warm ivory surfaces, rich charcoal sidebar, brass primary (`#B38A3E`), Playfair Display + Inter, generous spacing, soft shadows. Currency is **Naira (₦)**.

---

## Architecture

Feature-based, strictly typed, reusable by default.

```
src/
  app/            # router, navigation, layout wiring
  features/
    auth/         # login, session, permission engine
    platform/     # CloudTech console (orgs, subscriptions, plans, billing, analytics…)
    dashboard/    # firm executive dashboard
    clients/      # individual & corporate clients
    matters/      # matters + tracking timeline + notes + documents
    documents/    # firm-wide document management
    hearings/     # court calendar entries
    calendar/     # month + agenda views over hearings
    tasks/        # assignments, priorities, deadlines
    staff/        # lawyers & staff profiles, avatars
    notifications/# live activity feed + reminders
    administration/ # firm members & roles (Firm Settings)
  shared/         # ui primitives, components, hooks, lib, types
supabase/
  migrations/     # ordered SQL: schema, RLS, functions, triggers, seed
  functions/      # Edge Functions (admin-create-user, hard-delete-organization)
```

### Multi-tenancy & security

- Every tenant table carries `organization_id`; **RLS** enforces isolation via helpers `has_permission(org, perm)`, `is_org_member(org)`, `is_org_admin(org)`, `is_platform_admin()` (all `SECURITY DEFINER`).
- **Permission engine:** granular permission keys (`matters.create`, `documents.upload`, `staff.manage`, …) attached to roles (Managing Partner → Paralegal → HR/Finance/Receptionist). The UI hides what a role can't do; RLS blocks it server-side.
- **Storage:** private `documents` bucket (tenant-scoped by path) and public `avatars` bucket, both governed by storage policies.
- **Audit logging** on every meaningful action, surfaced live via Realtime.

### Authentication model (no public signup)

- The **first** account created becomes the **Platform Owner** automatically (bootstrap trigger).
- Platform Admins create **organizations** and each firm's first **admin**.
- Firm admins create their own **users** (lawyers, staff) from Firm Settings.
- Admin-created accounts are provisioned through the `admin-create-user` **Edge Function** (service role), so passwords never touch the browser.
- Permanently deleting a trashed organization goes through the `hard-delete-organization` **Edge Function**, which purges the login accounts of members who exist only for that firm via the Auth Admin API before removing the organization row — `auth.users` isn't reachable from a plain SQL function.

---

## Modules

**Platform Console** — Dashboard (orgs, MRR/ARR, trials, health, activity) · Organizations (create with plan, suspend/activate, soft-delete → Trash → purge) · Organization Users (read-only directory) · Subscriptions (inline plan/status) · Plans & Pricing (editable + custom tiers) · Billing (revenue by plan, renewals) · Platform Analytics · Audit Logs · plus scaffolds for Support Tickets, System Health, Platform Users, Settings.

**Organization Workspace** — Dashboard (activity trend, KPIs) · **Clients** · **Matters** (auto matter numbers, detail with **Tracking** timeline, Documents, Notes) · **Documents** (upload PDF/Office/images, in-app preview) · **Hearings** · **Calendar** (month + agenda) · **Tasks** (assignments, due dates, overdue) · **Lawyers & Staff** (profiles, bar membership, avatars, assigned matters) · **Notifications** (live activity + reminders) · **Firm Settings** (members & roles).

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure Supabase

Create a Supabase project, then copy the environment file and fill in your project values:

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

> The anon key is safe for the browser — RLS enforces all access.

### 3. Apply the database

Run the SQL migrations in `supabase/migrations/` in order (Supabase **SQL Editor**, or `supabase db push` if linked). They create the schema, RLS policies, functions, triggers, and the `documents` / `avatars` storage buckets.

### 4. Deploy the Edge Function

```bash
supabase functions deploy admin-create-user
```

### 5. Create the Platform Owner

In the Supabase dashboard → **Authentication → Users → Add user** (your email + password). The first user is auto-promoted to Platform Owner.

### 6. Run

```bash
npm run dev
```

Open the printed URL, sign in as the Platform Owner, create an organization + its admin, then explore the firm workspace as that admin.

### Build

```bash
npm run build && npm run preview
```

---

## Roadmap

- **Billing** — time entries, expenses, invoices (PDF generation), payments, trust accounts, revenue dashboard
- **Reports** — matter, lawyer-productivity, client and financial reporting
- Support Mode (audited firm impersonation), Support Tickets, System Health, in-house DOCX→PDF preview

---

## Status

Actively built module by module — each ships with schema, RLS, types, services, hooks, and UI before the next begins. See `supabase/migrations/` for the authoritative, ordered database history.
