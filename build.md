# Blair Lawn Care — Build Plan

This document describes what exists today (a working prototype), what a real
production build needs to look like, and the steps to get from one to the
other. It's written for whoever picks up the real build — that may be you,
a hired developer, or future-you six months from now.

---

## 1. What exists today

Everything built so far lives in **two static HTML files**, each fully
self-contained (HTML + CSS + JS in one file, no build step, no server):

- `blair-lawn-care.html` — the boss/admin dashboard
- `blair-lawn-care-employee.html` — a standalone single-employee view

There is no backend and no real database. All data is stored in the
browser's `localStorage`, which means:

- Data is **per-browser, per-device**. It does not sync between a phone and
  a laptop, and does not survive clearing browser data.
- Two people looking at the "same" dashboard on two different computers are
  looking at two different, disconnected copies of the data.
- There is no real authentication — the boss/employee "access codes" are a
  UI convenience, not security. Anyone with the file and a guess (or the
  0000 reset) can get into the employee view; anyone with the boss code can
  get into everything.
- Nothing is backed up unless the user manually exports it (see the
  Settings → Backup feature, which produces a point-in-time `.xlsx` file).

**This is intentional.** The prototype exists to nail down the UI, the
workflows, and the data shape before spending money and time on a real
backend. It's a design tool, not a product.

### 1.1 What the prototype already does well

Treat this as the feature spec for the real build — everything below has
already been designed, tested in the browser, and refined through several
rounds of feedback. The real build's job is mostly to give this UI a real
backend, not to redesign it.

**Boss dashboard**
- Overview page: today's schedule, crew status, revenue snapshot, customer
  list, to-do panel, receipt capture, "time active online" tracker
- Jobs page: today's jobs + week-ahead view
- Customers page: add/view customer profiles (contact info, plan, last
  service date with a red flag when a Weekly customer is 6+ days overdue,
  card-on-file *reference* data, contract file upload, linked invoices,
  linked job history)
- Invoices page: create invoices linked to real customer records, mark
  recurring (one-time / weekly / bi-weekly / custom), "Charge card on file"
  action (currently simulated — see §3)
- Revenue page: weekly/monthly stats, outstanding balance, recurring
  revenue, revenue per labor hour, AR aging (0–30/31–60/61+ days overdue),
  revenue by customer, revenue by service type, cards-on-file coverage
- Schedule page: drag-and-drop weekly crew shift board, drag-and-drop lawn
  scheduler with recurrence-aware "ghost" reminders (bi-weekly customers
  show "not due yet" vs. "due this week"), time-off request review/approval
- Receipts page: gallery of all captured receipts across the crew
- Time Logs page: all clocked hours and timed jobs across the crew
- Crew page: crew status, shift hours table
- Settings page: one-click monthly data export to a real `.xlsx` file
  (invoices, customers, shifts, timesheets, timer logs, time off, to-dos,
  receipts)

**Employee view**
- Clock in / clock out with a live running timer
- Per-job timer with named entries
- "My schedule this week" (real shift data, not a placeholder)
- To-do list from the boss
- Time-off request form
- Receipt capture
- Access gated by a 4-digit personal PIN with a self-serve reset flow

**Cross-cutting**
- Boss ⇄ employee view toggle, gated by an access code, with a "which
  employee" picker on the way in
- Shared local-storage keys mean the boss file and the standalone employee
  file **can** see each other's data, but only if opened in the same
  browser — see §1.2

### 1.2 Known limitations of the prototype (read before estimating the real build)

- **No real multi-user sync.** This is the big one. Two devices don't share
  data unless it's the same browser profile.
- **No real security.** PINs and access codes are stored in plain
  `localStorage` and are trivially bypassable by anyone who opens dev tools.
- **"Charge card on file" is fake.** It flips an invoice's status to Paid
  locally. No money moves. No real card data is stored — only brand, last
  4 digits, and expiry, entered by hand.
- **Files (receipts, contracts) are stored as base64 inside `localStorage`,**
  which has a small quota (commonly 5–10MB total per browser origin). This
  works for a handful of receipts and contracts in testing but **will not
  scale** — a real build needs real file storage (S3, Cloudflare R2, etc.).
- **Dates are inconsistently formatted.** Some records store a real ISO
  date (`2026-08-05`); others store a short display string with no year
  (`"Aug 5"`), generated at the moment of creation. The revenue/AR-aging
  math works around this with heuristics (matching month names, assuming
  the current year) that are good enough for a prototype but not for real
  accounting. **The real data model should use real dates everywhere.**
- **The route/map planner and Leaflet integration were built and then
  removed** at the user's request. If real route optimization is wanted
  later, it's a separate scope of work (a mapping/routing API, likely
  Google's or Mapbox's, with real API costs).

---

## 2. Why a real build is needed

The prototype cannot do three things the business actually needs:

1. **Multiple people, multiple devices, one shared truth.** A crew member
   clocking in from their phone needs the boss to see it on a laptop
   immediately — not "if they happen to be using the same browser."
2. **Real money movement.** Charging a saved card and having that
   reconcile with real accounting requires a real payment processor and a
   real backend — this cannot happen in a browser-only file, for the same
   reason no legitimate business lets a static webpage hold processor
   credentials.
3. **Real backups and real security.** A `.xlsx` export you remember to
   click is not a backup strategy. A PIN stored in `localStorage` is not
   access control.

---

## 3. Target architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   Frontend       │  HTTPS │   Backend API     │  HTTPS │   QuickBooks      │
│  (this dashboard,│───────▶│  (Node/Express or │───────▶│   Online API +    │
│   served for     │        │   Python/FastAPI) │        │   Payments API    │
│   real, not a    │◀───────│                   │◀───────│                   │
│   local file)     │        └────────┬──────────┘        └──────────────────┘
└─────────────────┘                 │
                                     ▼
                          ┌──────────────────┐
                          │  Real database    │
                          │ (Postgres/similar)│
                          └──────────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  File storage     │
                          │ (S3 / R2 / similar)│
                          │ receipts, contracts│
                          └──────────────────┘
```

**Frontend:** This dashboard's HTML/CSS/JS is a legitimate head start — it
does not need to be thrown away. The real work is swapping every
`localStorage.getItem`/`setItem` call for a `fetch()` call to the backend
API. The layout, the drag-and-drop scheduler, the modals, the design
system — all of that carries over as-is.

**Backend:** A small REST (or GraphQL, if preferred) API that:
- Owns the database
- Holds the QuickBooks OAuth tokens (never exposed to the browser)
- Proxies invoice/customer/payment operations to QuickBooks
- Handles file uploads (receipts, contracts) to real object storage
- Implements real authentication (see §6)

**Database:** Postgres (or similar) replacing every `localStorage` key
listed in §5 with a real table.

**File storage:** Receipts and contract uploads move out of `localStorage`
and into S3-compatible object storage, with the database storing only a
URL/reference.

**QuickBooks:** See §4.

---

## 4. QuickBooks integration plan

Two separate QuickBooks APIs are involved, and they are not equally ready
to build against on day one.

### 4.1 Accounting API (Invoices, Customers) — build this first

- Mature, well-documented REST API, OAuth 2.0
- Real `Invoice` and `Customer` objects: create, read, update
- This is what makes "our invoices" and "our customers" actually be
  QuickBooks records instead of a local copy — your bookkeeper sees the
  same numbers you do
- **Action item:** register an app in the Intuit Developer Portal, get
  sandbox credentials, build the OAuth flow first (this is usually the
  slowest part to get right, budget real time for it)

### 4.2 Payments API (charge a card) — build this second

- Lets the backend charge a saved card and record the payment
- **Important wrinkle:** a card saved through this API is **not** visible
  inside the QuickBooks Online interface itself — it's a token store your
  backend queries, not something a bookkeeper browses to in the QuickBooks
  UI. Design the "card on file" feature with this in mind; don't assume
  parity with what QuickBooks' own invoicing screen shows.
- The "Charge card on file" button already built in the dashboard is the
  right UI — it just needs its click handler pointed at a real backend
  endpoint instead of a local status flip

### 4.3 Payroll API — plan for it, don't block on it

- Intuit gates production access to the Payroll API separately from the
  other two APIs, and approval is reported to take **weeks to months**,
  not a same-day key
- Assumes an existing QuickBooks Payroll subscription — it doesn't create
  one for you
- Payroll also carries real legal weight (tax withholding, direct deposit,
  W-2s) that doesn't go away just because there's a backend now
- **Recommendation:** don't sequence this first. Build invoices → payments
  → payroll, in that order, and apply for Payroll API access early since
  the approval clock runs independently of how fast you build everything
  else

### 4.4 What NOT to try to build ourselves

Do not attempt to build a custom payment processor, custom card storage,
or a custom payroll/tax-withholding engine. All three are heavily
regulated, and QuickBooks (or Square, if that's chosen instead — see the
earlier conversation for the same breakdown against Square) exists
specifically so a small business doesn't have to become a licensed money
transmitter to take a card payment.

---

## 5. Data model (replacing every localStorage key with a real table)

This maps directly from what the prototype already stores. Field names are
kept close to the prototype's JS object shapes so the mapping is obvious.

| localStorage key | Becomes table | Notes for the real build |
|---|---|---|
| `blair_customers` | `customers` | Add real `id` (UUID), keep name/phone/address/plan/last_service_date. **Card fields become a reference to a QuickBooks/processor token, not stored locally.** Contract file becomes a `contract_file_url` pointing at object storage, not base64. |
| `blair_invoices` | `invoices` | Becomes a synced mirror of the QuickBooks Invoice object (or QuickBooks becomes the source of truth and this table is a cache). `due_date` becomes a real `DATE` column, not a display string. `recurrence` stays as an enum. |
| `blair_scheduled_shifts` | `crew_shifts` | Employee becomes a real foreign key to a `users`/`employees` table, not a name string. |
| `blair_scheduled_lawns` | `scheduled_jobs` | Same employee FK note. `recurrence` enum carries over as-is — the due/not-due logic already built is worth keeping, just re-implemented against real dates. |
| `blair_shifts` | `time_clock_entries` | Clock in/out records. `date` becomes a real timestamp. |
| `blair_timelogs` | `job_timer_entries` | Per-job timer entries. |
| `blair_timeoff` | `time_off_requests` | `status` enum (pending/approved/denied) carries over. |
| `blair_todos` | `todos` | Simple table, employee FK. |
| `blair_receipts` | `receipts` | `data_url` becomes `file_url` pointing at object storage. Keep `note`, `uploaded_by` (→ FK), `created_at`. |
| `blair_employee_codes` | *(removed)* | Replaced entirely by real authentication — see §6. |
| `blair_online_time` | `session_time_log` | Optional to carry forward; low priority. |

**Also new, not currently in the prototype:**
- `users` / `employees` table with real identity (see §6)
- `audit_log` — who changed what, when (worth having from day one once
  real money and real customer data are involved)

---

## 6. Authentication & roles

The prototype's 4-digit PIN system was designed for a **shared physical
device** (a tablet in the truck or shop) where speed of switching between
crew members mattered more than real security. That's a reasonable kiosk
pattern — but it should sit **on top of** real auth, not replace it.

Recommended approach for the real build:

1. **Real accounts** — each employee gets a real login (email + password,
   or better, a magic-link/SSO flow) issued by the boss when they're hired.
2. **Roles** — `boss` / `employee` as a real field on the user record,
   checked server-side on every API call, not just hidden in the frontend.
3. **Keep the PIN pad as a convenience layer on shared devices** — once a
   device is logged in as "the shop tablet" under a real account with
   limited scope, the 4-digit PIN can still be the fast way to switch
   *which employee's view* is showing, without it being the only thing
   standing between someone and the whole system.
4. **The boss access code (2802) goes away** in its current form — replace
   "type a shared password to see admin data" with "the boss's real login
   has admin role, the employee's real login doesn't."

---

## 7. Migration plan

Recommended order, each phase shippable and useful on its own:

**Phase 1 — Foundation**
- Stand up backend + database + hosting
- Real authentication (§6)
- Port Customers and Jobs/Schedule data models to the real database
  (no QuickBooks yet — just get off `localStorage`)
- Frontend swapped to call the API instead of `localStorage`

**Phase 2 — QuickBooks accounting sync**
- OAuth flow to connect the business's QuickBooks Online account
- Invoices and Customers created here become real QuickBooks records
- Revenue page's stats begin pulling from real invoice data (this
  actually simplifies the AR-aging logic, since real dates replace the
  short-string heuristics)

**Phase 3 — Payments**
- QuickBooks Payments API wired to the "Charge card on file" button
- Real card tokenization (never touches your server in raw form)

**Phase 4 — File storage**
- Receipts and contract uploads move to S3/R2
- `localStorage` quota pressure disappears

**Phase 5 — Payroll (as soon as Intuit approves API access)**
- Apply for this early (§4.3) so approval isn't the bottleneck once
  everything else is ready

**Explicitly out of scope unless requested later:**
- Route optimization / mapping (removed from the prototype at the user's
  request; would need a real mapping API like Google's or Mapbox's if
  revisited)
- Multi-tenant support (this build assumes one business, one QuickBooks
  account)

---

## 8. Hosting & stack recommendations

- **Backend:** Node.js + Express (pairs naturally with the existing
  JavaScript-heavy frontend) or Python + FastAPI, either is fine — pick
  whichever the person building it is more comfortable maintaining
- **Database:** Postgres (Render, Railway, and Supabase all offer managed
  Postgres with minimal setup)
- **Hosting:** Render or Railway for a first deploy — both support a
  Node/Python backend plus a Postgres database without needing to hand-roll
  infrastructure
- **File storage:** Cloudflare R2 (S3-compatible, no egress fees) or AWS S3
- **Frontend hosting:** can be served by the same backend, or split out to
  a static host (Vercel, Netlify, Cloudflare Pages) that calls the API

---

## 9. Security notes for the real build

- Card data: never touches your server in raw form — QuickBooks Payments'
  hosted tokenization handles this, same pattern as Square's Web Payments
  SDK. Your server only ever sees a token, never a PAN or CVV.
- QuickBooks OAuth tokens: stored server-side only, encrypted at rest,
  never sent to the browser
- Contract files may contain sensitive personal/business information —
  object storage should be private by default, served via short-lived
  signed URLs, not public links
- Real audit logging becomes important once real invoices and real money
  are involved — who marked what paid, who edited a customer's card
  reference, etc.

---

## 10. Open questions to settle before or during Phase 1

- QuickBooks vs. Square for payments — this was discussed at length and
  leaned toward QuickBooks for the accounting sync, but worth a final
  decision before OAuth work starts, since the two aren't interchangeable
  once card tokens exist in one system
- Hosting provider preference
- Backend language preference (Node vs. Python)
- Does a QuickBooks Online + Payroll subscription already exist, or does
  that need to be set up first?
- Is multi-employee real-account management (adding/removing crew logins)
  something the boss needs to self-serve on day one, or can that start as
  a manual/admin task?

---

*This document reflects the state of the prototype as of the current
build. Update it as decisions get made — it's meant to be a living plan,
not a one-time spec.*
