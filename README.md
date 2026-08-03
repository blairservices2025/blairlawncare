# Blair Lawn Care

A real, multi-user version of the Blair Lawn Care dashboard — built per
[`build.md`](./build.md) Phase 1 + Phase 4:

- **Next.js app** (in [`web/`](./web)) hosted on **Vercel**
- **Supabase** for the database (Postgres), authentication, and file storage
- Real logins with **boss / employee roles** enforced server-side (RLS)
- Receipts & contracts stored in **Supabase Storage** (private buckets,
  signed URLs) — no more base64 in localStorage

## What's included

**Boss dashboard** — Overview (today's schedule, crew status, revenue
snapshot, to-dos, service flags) · Jobs (today + week ahead) · Customers
(profiles, plan, overdue flags, card-on-file *reference*, contract upload,
linked invoices & job history) · Invoices (create, recurrence, mark paid,
"charge card" placeholder for Phase 3) · Revenue (weekly/monthly, outstanding,
recurring, revenue per labor hour, AR aging, revenue by customer & plan,
cards-on-file coverage) · Schedule (drag-and-drop week board for shifts and
jobs, recurrence-aware "due / not due" reminders, time-off review) · Receipts
gallery · Time Logs · Crew · Settings (one-click `.xlsx` export of every table)

**Employee view** (`/employee`) — clock in/out with live timer · per-job
timer · my schedule this week · to-dos from the boss · receipt capture
(camera-friendly) · time-off requests

## Setup — do these once, in order

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Once it's ready, open **SQL Editor → New query**, paste the entire contents
   of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**.
   That creates every table, all the security rules, and the two file buckets.
3. Go to **Authentication → Users → Add user** and create **your own account
   first** (email + password, check "auto-confirm").
   ⚠️ The first account ever created automatically becomes the **boss** —
   every account created after it is an **employee**.
4. Add a user for each crew member the same way, and give them their password.

### 2. Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   this repo.
3. Set **Root Directory** to `web`.
4. Add two **Environment Variables** (values are in Supabase →
   **Project Settings → API**):
   - `NEXT_PUBLIC_SUPABASE_URL` — your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` `public` key
5. Click **Deploy**. That's it — the app is live at your Vercel URL.

### 3. Sign in

Open the Vercel URL, sign in with the boss account → you land on the boss
dashboard. Crew members sign in with their accounts → they land on the
employee view. The boss can also open the employee view from the sidebar.

## Local development

```bash
cd web
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev                  # http://localhost:3000
```

## Security notes

- Roles are enforced by **Postgres Row Level Security**, not by the frontend —
  an employee's login physically cannot read customers, invoices, or other
  people's time entries, even with dev tools open.
- Receipt/contract buckets are **private**; files are served via short-lived
  signed URLs. Employees can only upload into their own folder.
- Card-on-file fields are **reference only** (brand, last 4, expiry). Real
  charging is Phase 3 (QuickBooks Payments) per `build.md` — never enter a
  full card number.
- Every insert/update/delete on customers and invoices is recorded in
  `audit_log`.

## What's deliberately NOT in this phase (see build.md)

- QuickBooks accounting sync (Phase 2)
- Real card charging (Phase 3) — the button exists but only records the
  invoice as paid after a confirmation that says so
- Payroll (Phase 5 — apply for Intuit API access early)
- Route optimization / mapping (explicitly out of scope)
