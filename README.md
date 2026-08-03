# Blair Lawn Care

A real, multi-user version of the Blair Lawn Care dashboard — built per
[`build.md`](./build.md) Phase 1 + Phase 4:

- **Next.js app** hosted on **Vercel**
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
jobs, recurrence-aware "due / not due" reminders, last-week ghosts,
time-off review) · Receipts (capture + gallery) · Time Logs (editable) ·
Crew · Settings (`.xlsx` export, Square connection)

**Employee view** (`/employee`) — clock in/out with live timer · per-job
timer · my schedule this week · to-dos from the boss · receipt capture
(camera-friendly) · time-off requests · personal 4-digit code

**Switching views** — a 4-digit code guards each direction: the boss code
(2802 by default) to enter the boss view, and each employee's own code to
open theirs on a shared device. 0000 is the reset path for a forgotten
code. Codes are stored bcrypt-hashed. They are a convenience lock for a
shared tablet — the real protection is each person's login plus the
row-level security rules.

## Setup — do these once, in order

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Once it's ready, open **SQL Editor → New query** and run each file in
   [`supabase/`](./supabase) **in order**, pasting the contents and clicking
   **Run**. Each one only adds things, so they are safe to re-run:

   | File | What it adds |
   |---|---|
   | `schema.sql` | every table, the security rules, the two file buckets |
   | `02-pins.sql` | the 4-digit view codes (boss code seeded as 2802) |
   | `03-session-time.sql` | the time-on-the-app tracker |
   | `04-timeoff-times.sql` | start/end times on time-off requests |
   | `05-square.sql` | the columns that link records to Square |
   | `06-job-details.sql` | time and service label on scheduled jobs |
3. Go to **Authentication → Users → Add user** and create **your own account
   first** (email + password, check "auto-confirm").
   ⚠️ The first account ever created automatically becomes the **boss** —
   every account created after it is an **employee**.
4. Add a user for each crew member the same way, and give them their password.

### 2. Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   this repo.
3. Add two **Environment Variables** (values are in Supabase →
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

## Connecting Square (optional)

With Square connected, customers and invoices created there appear in the
app on their own. Set these in **Vercel → Settings → Environment
Variables** (tick Production *and* Preview), then redeploy — names are
case-sensitive:

| Variable | Where it comes from |
|---|---|
| `SQUARE_ACCESS_TOKEN` | developer.squareup.com → your app → Credentials |
| `SQUARE_ENVIRONMENT` | `production` or `sandbox` — must match the token |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → **Secret keys** |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square → Webhooks → your subscription |

The Settings page reports which of these are still missing, shows the
webhook address to paste into Square, and has a **Sync now** button that
pulls everything across.

The service role key is needed because Square's webhooks arrive with
nobody signed in, so there is no session for the security rules to check.
It is only ever read server-side.

## What's deliberately NOT in this phase (see build.md)

- QuickBooks accounting sync (Phase 2)
- Real card charging (Phase 3) — the button exists but only records the
  invoice as paid after a confirmation that says so
- Payroll (Phase 5 — apply for Intuit API access early)
- Route optimization / mapping (explicitly out of scope)
