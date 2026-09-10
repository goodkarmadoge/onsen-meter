-- Yunomori Onsen Live Crowd Meter — domain logic.
-- All occupancy mutation happens inside these functions so that concurrent
-- taps at a busy locker desk serialise correctly (PRD §6.3).

-- ---------------------------------------------------------------------------
-- Time helpers. [PRD-FIX #9] Open/closed is always computed in the VENUE's
-- timezone, never the visitor's — a guest browsing from Bangkok must see
-- Singapore's hours.
-- ---------------------------------------------------------------------------
create or replace function public.venue_now(p_location_id uuid)
returns timestamp language sql stable as $$
  select (now() at time zone l.timezone) from public.locations l where l.id = p_location_id;
$$;

create or replace function public.venue_business_date(p_location_id uuid)
returns date language sql stable as $$
  select public.venue_now(p_location_id)::date;
$$;

create or replace function public.is_open_now(p_location_id uuid)
returns boolean language plpgsql stable as $$
declare
  v_now   timestamp := public.venue_now(p_location_id);
  v_time  time      := v_now::time;
  h       public.operating_hours;
begin
  select * into h from public.operating_hours
   where location_id = p_location_id and dow = extract(dow from v_now)::smallint;
  if not found or h.is_closed then return false; end if;

  if h.closes_at > h.opens_at then
    return v_time >= h.opens_at and v_time < h.closes_at;
  else
    -- Hours crossing midnight. Yunomori SG doesn't, but other branches might.
    return v_time >= h.opens_at or v_time < h.closes_at;
  end if;
end $$;

-- Next opening moment, as an absolute timestamp, for the Closed-state copy
-- ("Currently closed — opens at 10:00").
create or replace function public.next_open_at(p_location_id uuid)
returns timestamptz language plpgsql stable as $$
declare
  v_tz    text;
  v_now   timestamp := public.venue_now(p_location_id);
  v_day   date;
  h       public.operating_hours;
  i       integer;
begin
  select timezone into v_tz from public.locations where id = p_location_id;
  for i in 0..7 loop
    v_day := v_now::date + i;
    select * into h from public.operating_hours
     where location_id = p_location_id and dow = extract(dow from v_day)::smallint;
    if found and not h.is_closed then
      if i > 0 or v_now::time < h.opens_at then
        return (v_day + h.opens_at) at time zone v_tz;
      end if;
    end if;
  end loop;
  return null;
end $$;

-- Today's opening moment (null if the venue is closed today). Used to date the
-- start-of-day reset honestly.
create or replace function public.opened_at_today(p_location_id uuid)
returns timestamptz language plpgsql stable as $$
declare
  v_tz  text;
  v_now timestamp := public.venue_now(p_location_id);
  h     public.operating_hours;
begin
  select timezone into v_tz from public.locations where id = p_location_id;
  select * into h from public.operating_hours
   where location_id = p_location_id and dow = extract(dow from v_now)::smallint;
  if not found or h.is_closed then return null; end if;
  return (v_now::date + h.opens_at) at time zone v_tz;
end $$;

-- ---------------------------------------------------------------------------
-- Tier resolution.
-- [PRD-FIX #5] The PRD's ranges ("0-20%", "21-40%") leave 20.5% in no tier at
-- all, because occupancy is continuous. These are half-open intervals instead:
-- [0,t1], (t1,t2], ... And because §6.2 explicitly allows the count to exceed
-- capacity, anything above the top bound clamps to the top tier rather than
-- falling off the "81-100%" ceiling.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_tier(p_location_id uuid, p_pct numeric)
returns public.tiers language plpgsql stable as $$
declare t public.tiers;
begin
  select * into t from public.tiers
   where location_id = p_location_id and p_pct <= upper_bound_pct
   order by ordinal limit 1;
  if not found then
    select * into t from public.tiers
     where location_id = p_location_id order by ordinal desc limit 1;
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Public read. Returns the tier ONLY — never the count, never the percentage.
-- [PRD-FIX #4] §5 and §7.2 contradict each other on exposing an exact
-- percentage; §12 Q3 leaves it open. Resolved as tier-only, because with a
-- knowable capacity a percentage *is* the headcount. The meter fill is derived
-- from the tier's ordinal, so the wire format leaks nothing finer than the
-- five labels a guest already sees.
-- ---------------------------------------------------------------------------
create or replace function public.public_status(p_slug text)
returns json language plpgsql stable as $$
declare
  loc         public.locations;
  occ         public.current_occupancy;
  t           public.tiers;
  v_today     date;
  v_count     integer;
  v_updated   timestamptz;
  v_pct       numeric;
  v_open      boolean;
  v_state     text;
  v_tiers     integer;
begin
  select * into loc from public.locations where slug = p_slug and is_active;
  if not found then return null; end if;

  select * into occ from public.current_occupancy where location_id = loc.id;
  v_today   := public.venue_business_date(loc.id);
  v_open    := public.is_open_now(loc.id);
  v_count   := coalesce(occ.current_count, 0);
  v_updated := occ.last_updated_at;

  -- [PRD-FIX #1/#6] Lazy start-of-day reset. Yesterday's leftover count is not
  -- today's occupancy. Reported as fresh, not stale: an empty bath at opening
  -- time is a fact we know, not missing data.
  if occ.business_date is distinct from v_today then
    v_count   := 0;
    -- Dated at today's opening time, not now(): if it is 15:00 and nobody has
    -- tapped since yesterday, that genuinely IS stale and must read as stale.
    v_updated := coalesce(public.opened_at_today(loc.id), now());
  end if;

  select count(*) into v_tiers from public.tiers where location_id = loc.id;
  v_pct := (v_count::numeric * 100) / loc.comfortable_capacity;
  t     := public.resolve_tier(loc.id, v_pct);

  if not v_open then
    v_state := 'closed';
  elsif v_updated is null then
    v_state := 'unavailable';
  elsif v_updated < now() - make_interval(mins => loc.stale_after_minutes) then
    v_state := 'stale';
  else
    v_state := 'live';
  end if;

  return json_build_object(
    'location',        json_build_object('name', loc.name, 'timezone', loc.timezone),
    'state',           v_state,
    'tier', case when t.id is null or v_state = 'closed' then null else json_build_object(
        'ordinal',     t.ordinal,
        'label',       t.label,
        'description', t.description,
        'color',       t.color,
        'of',          v_tiers
    ) end,
    'lastUpdatedAt',      v_updated,
    'staleAfterMinutes',  loc.stale_after_minutes,
    'opensAt',            case when v_open then null else public.next_open_at(loc.id) end,
    'serverTime',         now()
  );
end $$;
