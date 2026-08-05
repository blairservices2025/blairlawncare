# Blair Lawn Care

A real, multi-user version of the Blair Lawn Care dashboard — built per
[`build.md`](./build.md) Phase 1 + Phase 4:

- **Next.js app** hosted on **Vercel**
- **Supabase** for the database (Postgres), authentication, and file storage
- Real logins with **boss / employee roles** enforced server-side (RLS)
- Receipts & contracts stored in **Supabase Storage** (private buckets,
  signed URLs) — no more base64 in localStorage

## What's included

**Clients and yards** — Square only knows about the client. Yards exist
only here: the card is saved against the client once, and each billed
yard becomes its own Square invoice to that client with the yard name on
it. A client can have several properties mowed. Each
yard has its own address, plan, price, gate code and service history; the
client is who gets billed and whose card is on file. Jobs are scheduled
against a yard, so the crew see the yard name with the client underneath.

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

**Signing in** — an email and a 4-digit code is the everyday way in. A
password and an emailed sign-in link both still work. Codes are set by the
boss on the Crew page, so a new crew member never has to be signed in
already to get their first one. Five wrong codes locks that email for
fifteen minutes.

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
   | `07-payments.sql` | recording real card charges |
   | `08-receipt-storage-fix.sql` | lets the boss file a receipt for a crew member, and clears deleted files |
   | `09-crew-job-board.sql` | the shared yard list the crew tick off |
   | `10-pin-login.sql` | signing in with an email and a 4-digit code |
   | `11-pin-hash-privacy.sql` | hides the code hashes from the browser |
   | `12-job-billing.sql` | prices on jobs and the link to their Square invoice |
   | `13-yards.sql` | one client, many yards |
   | `14-yard-autocreate.sql` | gives every new client a first yard |
   | `15-realtime.sql` | live updates for to-dos and time off |
   | `16-inventory.sql` | the inventory tab |
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
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | same Credentials page — needed to save cards |

The Settings page reports which of these are still missing, shows the
webhook address to paste into Square, and has a **Sync now** button that
pulls everything across.

Point the Square webhook at the **production** address, not a preview one
— preview URLs are frozen snapshots and change with every deployment.

### How the money side fits together

Jobs live in this app; money lives in Square. Each job carries the id of
the Square invoice raised for it, so the two stay linked without becoming
the same record — which is what lets you void a charge or redo a job
without corrupting job history.

1. **Card on file, once per customer.** Customer profile → **＋ Card on
   file**. The card is typed into a frame served by Square and tokenized
   there; it never reaches this app or its database. Square requires the
   customer to agree before a card is kept for future charges, so the
   form asks you to confirm they did.
2. **Work the day.** The crew tick yards off as they finish.
3. **Bill at the end of the day.** Jobs tab → **Ready to bill** lists
   finished, unbilled work. Send them and Square charges each saved card
   and emails the invoice and receipt together; customers without a card
   get an invoice to pay themselves.
4. **Square confirms.** The invoice webhook marks each job paid or
   flagged, so the job list and Square agree without checking both.

Card-on-file charges sit on Square's card-not-present rate — about 3.5%
+ 15¢ per charge, higher than an invoice the customer pays themselves.
The billing panel shows what that comes to before you send.

The service role key is needed because Square's webhooks arrive with
nobody signed in, so there is no session for the security rules to check.
It is only ever read server-side.

## What's deliberately NOT in this phase (see build.md)

- QuickBooks accounting sync (Phase 2)
- Real card charging (Phase 3) — the button exists but only records the
  invoice as paid after a confirmation that says so
- Payroll (Phase 5 — apply for Intuit API access early)
- Route optimization / mapping (explicitly out of scope)
