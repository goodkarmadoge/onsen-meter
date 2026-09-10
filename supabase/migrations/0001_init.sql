-- Yunomori Onsen Live Crowd Meter — initial schema
-- PRD §8.2. Deviations from the PRD sketch are marked [PRD-FIX].

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create table public.locations (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  timezone              text not null default 'Asia/Singapore',
  -- PRD §8.2: deliberately the *comfortable* capacity, never the fire-code max.
  comfortable_capacity  integer not null check (comfortable_capacity > 0),
  -- [PRD-FIX #3] The PRD gives three different staleness thresholds
  -- (§6.2 "30 min", §7.2 "30-60 min", §9 implies 15 min). One value, configurable.
  stale_after_minutes   integer not null default 45 check (stale_after_minutes > 0),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operating hours (per day-of-week). PRD §7.2 "Closed" state.
-- dow follows Postgres extract(dow): 0 = Sunday .. 6 = Saturday.
-- ---------------------------------------------------------------------------
create table public.operating_hours (
  location_id  uuid not null references public.locations(id) on delete cascade,
  dow          smallint not null check (dow between 0 and 6),
  opens_at     time,
  closes_at    time,
  is_closed    boolean not null default false,
  primary key (location_id, dow),
  constraint hours_present_unless_closed
    check (is_closed or (opens_at is not null and closes_at is not null))
);

-- ---------------------------------------------------------------------------
-- Tier configuration
-- [PRD-FIX #10] The PRD sketches TierConfig as tier_1..5_* COLUMNS, which
-- hardcodes exactly five tiers into the schema — contradicting §5's own
-- "configurable, not hardcoded" requirement. Rows instead: same effort,
-- and changing the number of tiers stays a config change, not a migration.
-- ---------------------------------------------------------------------------
create table public.tiers (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references public.locations(id) on delete cascade,
  ordinal          smallint not null check (ordinal > 0),
  upper_bound_pct  numeric(5,2) not null check (upper_bound_pct >= 0),
  label            text not null,
  description      text not null,
  color            text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (location_id, ordinal)
);

-- ---------------------------------------------------------------------------
-- Staff. PRD §6.2 — individual PIN login so the audit log is meaningful.
-- pin_hash is scrypt, computed in the app layer; never store a raw PIN.
-- ---------------------------------------------------------------------------
create table public.staff_users (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations(id) on delete cascade,
  name           text not null,
  pin_hash       text not null,
  role           text not null check (role in ('operator', 'manager')),
  is_active      boolean not null default true,
  failed_logins  integer not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);
create index staff_users_location_idx on public.staff_users(location_id) where is_active;

-- ---------------------------------------------------------------------------
-- Current occupancy (one row per location)
-- ---------------------------------------------------------------------------
create table public.current_occupancy (
  location_id     uuid primary key references public.locations(id) on delete cascade,
  current_count   integer not null default 0 check (current_count >= 0),
  -- [PRD-FIX #1/#6] The PRD never says what happens to the count at closing.
  -- Manual counting drifts upward (entry is gated by check-in, exit usually
  -- isn't), so a count that survives overnight compounds the drift forever.
  -- The business date this count belongs to; a new day resets to 0.
  business_date   date not null default current_date,
  last_updated_at timestamptz not null default now(),
  last_updated_by uuid references public.staff_users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Append-only audit log. PRD §6.2 "Accountability & audit".
-- ---------------------------------------------------------------------------
create table public.occupancy_events (
  id              bigserial primary key,
  location_id     uuid not null references public.locations(id) on delete cascade,
  staff_id        uuid references public.staff_users(id) on delete set null,
  -- [PRD-FIX #2] 'confirm' is not in the PRD. §9 asks for an update in every
  -- rolling 15-min window, which forces staff to tap even when nobody has
  -- entered or left — conflating "no activity" with "stale data". A zero-delta
  -- confirm refreshes freshness honestly without inventing movement.
  kind            text not null check (kind in ('delta','set_exact','confirm','undo','auto_reset')),
  delta           integer not null default 0,
  previous_count  integer not null,
  resulting_count integer not null,
  reason_note     text,
  business_date   date not null,
  undone_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index occupancy_events_recent_idx
  on public.occupancy_events(location_id, created_at desc);
create index occupancy_events_day_idx
  on public.occupancy_events(location_id, business_date);

-- ---------------------------------------------------------------------------
-- Lock everything down. All access is server-side via the service role;
-- the anon/publishable key must never be able to read staff or audit data.
-- RLS enabled with zero policies = deny all for anon/authenticated.
-- ---------------------------------------------------------------------------
alter table public.locations         enable row level security;
alter table public.operating_hours   enable row level security;
alter table public.tiers             enable row level security;
alter table public.staff_users       enable row level security;
alter table public.current_occupancy enable row level security;
alter table public.occupancy_events  enable row level security;
