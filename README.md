# Yunomori Onsen — Live Crowd Meter

A two-sided crowd meter for Yunomori Onsen & Spa Singapore: staff keep a running
count from a tablet at the locker desk, and prospective guests see how busy the
baths are before they leave home.

Implements *PRD: Yunomori Onsen Live Crowd Meter, Draft v1.0* (Phase 1 / MVP).
**Read [`docs/prd-deltas.md`](docs/prd-deltas.md)** — it lists every place this
build departs from the PRD and why, including several open questions the PRD
flags in §12.

---

**Live:** https://onsen-meter.vercel.app

> Until the environment variables below are set, every surface correctly shows
> its degraded state rather than an error — which is itself the §7.2
> "Unavailable" requirement working.

## Surfaces

| Route | Who | What |
|---|---|---|
| `/` | Guests | Standalone shareable meter — the QR-code destination for the lobby, and what goes on Google Business Profile |
| `/widget` | Guests | The bare embeddable widget; transparent, no chrome of its own |
| `/embed.js` | Web admin | Script embed that mounts `/widget` in an isolated iframe |
| `/embed-demo` | Web admin | Test page proving both embed methods work (PRD §7.5) |
| `/console` | Staff | The counter console |
| `/console/history` | Staff | Today's audit log and end-of-day reconciliation |
| `/console/settings` | Managers | Capacity, staleness threshold, tier labels/bounds/colours |
| `/api/public/status` | — | Cached, unauthenticated read. Tier and freshness only |

## Embedding

Preferred — auto-sizes, and hides itself if the backend is unavailable:

```html
<div id="yunomori-crowd-meter"></div>
<script src="https://<your-host>/embed.js" async></script>
```

Universal fallback — works on Wix, Squarespace, and anywhere custom scripts are
restricted:

```html
<iframe
  src="https://<your-host>/widget"
  title="How busy is Yunomori Onsen right now"
  style="width:100%;max-width:420px;height:230px;border:0"
  loading="lazy"
></iframe>
```

Visit `/embed-demo` on the deployment for both, rendering live, with the exact
snippets to hand over.

---

## The five tiers

| Tier | Covers | Label |
|---|---|---|
| 1 | 0–20% | **Serene** — Quiet right now. Baths are yours to enjoy. |
| 2 | >20–40% | **Tranquil** — Gently quiet. A relaxed time to visit. |
| 3 | >40–60% | **Comfortable** — Steady flow of guests. Still relaxed. |
| 4 | >60–80% | **Lively** — Busier than usual, a sociable, active atmosphere. |
| 5 | >80% | **Bustling** — Near full capacity. Expect a wait for some baths. |

Percentage is `count ÷ comfortable_capacity` — the number of guests at which the
baths stop feeling relaxed, **not** the fire-code maximum. All of it is editable
in Settings without a redeploy.

---

## Architecture

```
Staff console ──authenticated write──▶ Next.js route handlers ──▶ Supabase Postgres
                                              │                    (count, config,
Public widget ──poll every 45s──▶ /api/public/status                 audit log)
                                   (edge-cached 30s)
```

- **Next.js 14** (App Router) on Vercel, **Supabase Postgres** for storage.
- Every table has **RLS enabled with zero policies**. Nothing reaches the
  database except this app's own route handlers, using the service-role key.
- The one exception is `public_status`, which is `SECURITY DEFINER`: the public
  read is specified as unauthenticated (§8.1), so the *function* is the security
  boundary rather than the caller's key. It returns only the sanitised public
  payload. This means the guest-facing widget keeps working even if the
  service-role key is wrong, missing, or mid-rotation — only the staff console
  depends on it. Every mutating function has `EXECUTE` revoked from `anon`.
- All occupancy arithmetic lives in Postgres functions that take a row lock, so
  two staff tapping at once produce two increments rather than one lost update
  (PRD §6.3).
- The public endpoint returns **tier and freshness only** — no count, no
  percentage, no staff identity — and is edge-cached so guest traffic costs one
  database read per 30s window rather than one per visitor.
- `location_id` is threaded through everything from day one, so adding Bangkok
  or Pattaya is configuration rather than a migration (PRD §8.2).

---

## Setup

### 1. Database

Apply `supabase/migrations/*.sql` in order. `0004_seed_singapore.sql` seeds the
Singapore location, 10:00–22:00 daily hours, and the five tiers.

### 2. Environment

Copy `.env.example` and fill in:

| Variable | Where it comes from |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. Server-side only — never `NEXT_PUBLIC_` |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `LOCATION_SLUG` | `singapore` |

On Vercel these go in **Project → Settings → Environment Variables**, applied to
Production, Preview and Development, then redeploy.

`SESSION_SECRET` signs session cookies **and** peppers the PIN lookup index.
Changing it invalidates every session and every existing PIN, so treat it as
permanent.

### 3. Staff PINs

PowerShell:

```powershell
node scripts/make-staff.mjs "Aiko Tan" manager 481902 --secret <SESSION_SECRET>
```

bash / zsh:

```bash
SESSION_SECRET=<same value> node scripts/make-staff.mjs "Aiko Tan" manager 481902
```

The secret is also picked up from `.env.local` if present. It must match the
deployment's `SESSION_SECRET` — it peppers the PIN lookup index, so a mismatch
produces a PIN that silently never authenticates.

Prints SQL to paste into the Supabase SQL editor. The PIN itself never appears
in the output, in a migration, or in this repository — keep a record of it
separately. Create at least one `manager` before launch; only a manager can
reach Settings.

### 4. Run

```bash
npm install
npm run dev
```

---

## Before this goes live

1. **Confirm `comfortable_capacity`.** Seeded at 100 as a placeholder. This is
   the single most consequential number in the system — set too high and
   "Bustling" never appears; too low and it appears immediately. PRD §12 Q2.
2. **Confirm operating hours.** Seeded 10:00–22:00 daily from the public site.
3. **Confirm the CMS** behind yunomorionsen.com to choose the embed method.
4. **Create real staff PINs** and remove any test accounts.
5. **Agree a retention window** for `occupancy_events` — PRD §8.4 suggests 90
   days for raw events, aggregates kept longer. Not yet automated.

## Not in this build

Per PRD §3.2 and §11, deliberately out of scope for Phase 1: zone-level
breakdown, offline queue-and-sync on the console, predictive/historical
crowd levels, multi-branch rollout, reservation-system integration, and
YU Privilege Club alerts.

Also not built, and worth knowing about:

- **Per-day-of-week hours** exist in the schema but Settings does not expose an
  editor for them yet; change them in SQL.
- **Automated retention** for the audit log.
- **Automated accessibility checks** in CI — see
  [`docs/accessibility.md`](docs/accessibility.md) for what was verified by hand.
