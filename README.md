# Connect V2

The MVP launch scope for SingleInterface Connect — a standalone project, copied from
`TS-Connect@mvp-v2` and independent of it from this commit on.

> **This repo is not a branch of TS-Connect.** It has its own history, its own Vercel
> project and its own Supabase project. Fixes do not flow between the two automatically;
> anything that should exist in both has to be applied twice. That was the deliberate
> trade for a clean product line.

---

## What V2 is

**Store manager**

- Sign in with a registered mobile number; the stores you hold come from your assignment,
  not from a code you type.
- **Leads** — one list, every source (call · form · walk-in), one lifecycle:
  `missed → contacted → converted → review_requested → expired`.
- Request a review from a customer who has **converted** (the gate is enforced, not
  advisory).
- Profile performance: views, actions, reviews.

**Multi-location**

- A roll-up over the stores you were assigned, with the depth *derived* from what you
  hold — one city drills to stores, one state drills city → store, several states drill
  state → city → store. A level with a single child is not a level.
- Two leaderboards: calls by **missed %** and reviews by **negative review %**, both
  descending by default, both sortable, both rolling down a level on tap.

**Deliberately absent** (present in the north-star build, out of the MVP): Manage Media,
Business Profile editing, on-site location verification, the reviews inbox and reply
composer, the review QR sheet, and the notification centre.

---

## Build scope

`VITE_SCOPE` decides which product a build is. It defaults to `mvp`, so a plain
`npm run build` produces the launch scope — the fuller build is the one you ask for.

```bash
npm run build                  # MVP  (default)
VITE_SCOPE=full npm run build  # every surface on
```

These gates control what a manager can **reach**, not what ships in the bundle: the
screens are still imported, so their code and catalog strings remain in the build.
Dropping them for real needs dynamic imports at the call sites — worth doing for load
time, and not done here.

---

## Environment

| Variable | Where it lives | Notes |
| --- | --- | --- |
| `GEMINI_API_KEYS` | **Server only** | Comma-separated. Read by `api/gemini.js`. |
| `VITE_SUPABASE_URL` | Client | Omit to run on the seed fixture. |
| `VITE_SUPABASE_ANON_KEY` | Client | Omit to run on the seed fixture. |

> **Never set `VITE_GEMINI_API_KEYS` on a deployment.** Anything prefixed `VITE_` is
> inlined into the client JavaScript by Vite, so the key becomes readable by any visitor.
> `packages/core/lib/gemini.js` warns about this at runtime, and `api/gemini.js` exists
> precisely so the key can stay server-side. The prefixed form is for local development
> only.

Copy `.env.example` to `.env.local` for local work.

---

## Supabase

A **new** Supabase project needs every migration, in order:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_harden_rls.sql
supabase/migrations/0003_schema_fixes.sql
supabase/migrations/0004_customer_contact_fields.sql
supabase/migrations/0005_mvp_leads_and_assignments.sql   ← V2: lifecycle, sources, assignments
```

`0005` carries the five-state lifecycle, `customers.lead_source`, and
`manager_store_assignments`. It also repairs a check constraint that was already wrong
before V2: `calls.lead_status` allowed `('open','converted','lost')` while the app had
moved on, so a live write would have been rejected.

**Known gap, inherited:** the dealer-scoping half of `0002` is commented out — the
`using (true)` anon-select policies are still in force. It cannot be enabled until real
auth exists, because `current_dealer_id()` reads `auth.uid()`. Sign-in is still a
simulated OTP.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Gate, which is also the deploy command in `vercel.json`:

```bash
npm run lint && npm test && node scripts/i18n-lint.mjs && npm run build --workspace apps/web
```

A green gate does **not** mean the app runs — the tests exercise the data layer, not the
render tree. Drive the screens before believing a change works.

## Vercel

Root Directory must be the **repo root**, not `apps/web`. Every path in `vercel.json`
(`scripts/i18n-lint.mjs`, `--workspace apps/web`, `apps/web/dist`) is root-relative, and
pointing Vercel at `apps/web` breaks the build on its first command.
