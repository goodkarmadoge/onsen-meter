# Where this build departs from the PRD

Every deviation from *PRD: Yunomori Onsen Live Crowd Meter, Draft v1.0*, and
why. Nothing here changes the product's scope — these are gaps, contradictions
and one impossible acceptance criterion found while implementing it.

Items marked **Needs a decision** are still open with the business.

---

### 1. Manual counting drifts upward, and the PRD treats the drift as symmetric

§10 lists "staff forget to tap, count drifts from reality" as one risk with one
mitigation (a staleness indicator). But the drift has a direction. Entry is
gated — a guest checks in and is issued a locker — so `+1` gets tapped
reliably. Exit usually isn't gated, so `−1` gets missed. The count therefore
creeps **upward**, and the widget creeps toward "Bustling", suppressing exactly
the walk-ins §10's revenue-risk row already worries about.

**Built:** the count auto-resets to zero at the start of each business day, so
drift can never compound past one day. `current_occupancy.business_date` carries
the day; any read or write on a new day sees zero. The reset is written to the
audit log as an `auto_reset` event.

Today's log also surfaces recorded arrivals vs. recorded departures, because a
widening gap between them is the drift becoming visible.

**Recommended operationally:** tie the `−1` tap to locker-key return, which is
the one exit event that is already gated.

---

### 2. §9's freshness metric forces staff to fake taps

§9 targets "≥90% of open hours with an update within any rolling 15-min
window". During a genuinely quiet Tuesday morning nobody enters or leaves, so
there is nothing to tap — the only way to hit the target is to invent movement.
The metric conflates *no activity* with *stale data*.

**Built:** a **"Still accurate"** button that writes a zero-delta `confirm`
event. It refreshes freshness honestly without touching the count. Measure §9
against `confirm`-or-change instead of change alone.

---

### 3. Three different staleness thresholds

§6.2 says 30 minutes, §7.2 says 30–60 minutes, §9 implies 15.

**Built:** one value, `locations.stale_after_minutes`, defaulting to **45** and
editable in Settings. It drives the console's stale banner and the widget's
stale state together, so they can never disagree.

---

### 4. §5 and §7.2 contradict each other on showing an exact percentage

§5: "no raw headcounts, which are operationally sensitive". §7.2: "Exact
percentage can be available on hover/tap". §12 Q3 asks the question as still
open.

Worth noting either way: **with a knowable capacity, a percentage is the
headcount.** Publishing "62%" when capacity is discoverable publishes "62
guests". Exposing the percentage does not protect the sensitive number.

**Built:** tier-only, per your call. The public API's wire format carries no
count and no percentage at all, so this holds even against someone reading the
network tab. The meter's fill is derived from the tier's ordinal, not the true
percentage.

---

### 5. The tier ranges have a gap and a ceiling bug

§5's table reads 0–20, 21–40, 41–60, 61–80, 81–100. Occupancy is continuous
(count ÷ capacity), so **20.5% falls into no tier at all** — and every other
boundary has the same one-point hole.

Separately, §6.2 explicitly allows the count to exceed capacity ("a soft
warning, not a hard block"). At 130% the "81–100%" top tier matches nothing.

**Built:** half-open intervals — tier N covers *(previous bound, this bound]* —
and the top tier absorbs everything above it. Verified: 20.5% → Tranquil,
80.0% → Lively, 80.1% → Bustling, 130% → Bustling.

---

### 6. The PRD never says what happens to the count at closing

§6.3 says the console should "prompt a final reconciliation" but never says the
count zeroes. Without that, the widget shows yesterday's leftovers at 10:00.

**Built:** covered by the start-of-day reset in #1. The console shows an
explicit closing notice outside opening hours.

---

### 7. "Set exact count" violates §6.3's own atomicity rule

§6.3 correctly demands atomic increments rather than read-modify-write. But
"set exact count" *is* read-modify-write, and shift change is precisely when two
managers are most likely to reconcile at once — silently clobbering each other.

**Built:** set-exact is a compare-and-set. It sends the count the manager was
looking at; if the real count has moved, the write is rejected with a 409 and
the console says *"Someone else changed the count to 47 while you were typing."*

All four mutations run inside Postgres functions that take a row lock, so
concurrent taps serialise properly.

---

### 8. §8.1 says only "authenticated"

A short PIN is a small keyspace. Without throttling, the audit log §6.2 relies
on for accountability means nothing, because any PIN can be found by guessing.

**Built:**
- PIN-only login, POS-style, so the login page never publishes staff names.
- 6-digit PINs by default (`scripts/make-staff.mjs` warns below that).
- Failed attempts counted per client over a rolling 15-minute window; 10
  failures locks the endpoint out. Client IPs are stored hashed, never raw.
- `scrypt` for verification, plus a peppered HMAC lookup index so a database
  leak alone does not expose PINs — the pepper lives only in the app
  environment.
- Sessions are signed cookies, but role and `is_active` are re-read from the
  database on every request, so deactivating someone takes effect immediately
  rather than at token expiry.

**Needs a decision:** how staff PINs get issued and rotated in practice, and
who holds that list.

---

### 9. Open/closed must be computed in the venue's timezone

Not wrong in the PRD, just unstated: a guest browsing from Bangkok must see
Singapore's hours, so this can never be computed from the browser clock.

**Built:** all open/closed logic runs in Postgres against
`locations.timezone`.

---

### 10. `TierConfig`'s schema contradicts §5's own principle

§5 requires tier boundaries to be "a configurable setting, not hardcoded", but
§8.2 sketches the table as `tier_1..5_upper_bound_pct`, `tier_1..5_label` —
which hardcodes *exactly five tiers* into the schema. Wanting four or six later
becomes a migration.

**Built:** a `tiers` table with one row per tier. Same effort, and the count of
tiers stays configuration. Settings accepts 2–9.

---

### 11. §7.2's "hide the widget" is impossible for the iframe fallback

An iframe cannot collapse its own parent container, so the bare-iframe embed
can't hide itself when the backend is unavailable.

**Built:** the script embed listens for a `state` postMessage and hides the host
element — it owns the container, so it can. The iframe fallback degrades to a
neutral "Crowd levels are unavailable right now" card instead. Documented on
the embed test page so whoever installs it knows the difference.

---

### 12. §9's "widget views" metric is not measurable as specced

The widget polls every 30–60s, so request counts overstate viewers by roughly
60–120× per session, and §8.4 rules out per-guest tracking that would
disambiguate them.

**Not built** — deliberately out of MVP scope, and §9 itself warns against
over-engineering a metrics pipeline before there is usage data.

**Needs a decision:** if widget engagement is a launch metric, the honest cheap
version is counting *initial widget loads* (first render, not polls) and
comparing against site sessions from whatever analytics the site already runs.

---

### 13. §7.5's accessibility criterion cannot be met as written

§7.5 requires all five tier colours to "pass an automated WCAG 2.1 AA contrast
check". Measured against the implemented cream palette, no single text colour
works across all five, and none of the five reaches 3:1 as a standalone
graphical indicator.

This is inherent to §5's brief — warm spa mid-tones on a warm cream ground are
low-contrast by construction. The palette is doing what it was asked to.

**Built:** colour is made strictly redundant (label + filled-segment count +
colour), which satisfies §7.4 and moves the design out of WCAG 1.4.11's scope.
Full measurements and a suggested rewording in
[`accessibility.md`](./accessibility.md).

**Needs a decision:** keep the soft palette and reword the criterion
(recommended), or darken the five colours 15–25% and lose some of the softness.

---

## Still open from §12

| # | Question | Status |
|---|---|---|
| 1 | What CMS runs yunomorionsen.com? | **Open.** Both embed methods are built and tested, so this no longer blocks the build — but it does decide which snippet to hand the web admin. |
| 2 | Correct `comfortable_capacity`? | **Open.** Seeded at **100** as a deliberate placeholder. Editable in Settings; nothing needs redeploying. This is the single most important number to confirm before launch. |
| 3 | Should the exact percentage be guest-visible? | **Resolved:** tier-only. See #4. |
| 4 | Who operates the console, on what device? | **Open.** Built for a shared tablet with per-staff PINs. |
| 5 | Confirm operating hours per day? | **Open.** Seeded 10:00–22:00 daily. Per-day-of-week hours are in the schema; the Settings UI does not expose them yet. |
