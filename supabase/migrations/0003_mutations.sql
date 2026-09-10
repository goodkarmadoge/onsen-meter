-- Occupancy mutations. Every one of these takes a row lock on
-- current_occupancy before reading, so two staff tapping simultaneously at a
-- busy locker desk produce two increments, never a lost update (PRD 6.3).

-- Locks the occupancy row, rolling the business date over if this is the first
-- write of a new day. Returns the locked, rolled row.
create or replace function public.lock_occupancy(p_location_id uuid)
returns public.current_occupancy language plpgsql as $$
declare
  occ     public.current_occupancy;
  v_today date;
begin
  select * into occ from public.current_occupancy
   where location_id = p_location_id for update;
  if not found then
    raise exception 'unknown_location' using errcode = 'P0002';
  end if;

  v_today := public.venue_business_date(p_location_id);
  if occ.business_date is distinct from v_today then
    insert into public.occupancy_events
      (location_id, staff_id, kind, delta, previous_count, resulting_count, reason_note, business_date)
    values
      (p_location_id, null, 'auto_reset', -occ.current_count, occ.current_count, 0,
       'Automatic start-of-day reset', v_today);
    update public.current_occupancy
       set current_count = 0, business_date = v_today,
           last_updated_at = now(), last_updated_by = null
     where location_id = p_location_id
     returning * into occ;
  end if;
  return occ;
end $$;

-- Shared shape returned to the console after every mutation.
create or replace function public.console_snapshot(p_location_id uuid)
returns json language plpgsql stable as $$
declare
  loc     public.locations;
  occ     public.current_occupancy;
  t       public.tiers;
  v_pct   numeric;
  v_last  public.occupancy_events;
  v_today date;
  v_count integer;
begin
  select * into loc from public.locations where id = p_location_id;
  select * into occ from public.current_occupancy where location_id = p_location_id;
  v_today := public.venue_business_date(p_location_id);
  v_count := case when occ.business_date is distinct from v_today then 0 else occ.current_count end;

  v_pct := (v_count::numeric * 100) / loc.comfortable_capacity;
  t     := public.resolve_tier(p_location_id, v_pct);

  -- The undoable event: the most recent countable action today, and only if
  -- nothing has happened since. PRD 6.2 - single-level undo is sufficient.
  select * into v_last from public.occupancy_events
   where location_id = p_location_id and business_date = v_today
   order by created_at desc, id desc limit 1;

  return json_build_object(
    'count',             v_count,
    'capacity',          loc.comfortable_capacity,
    'pct',               round(v_pct, 1),
    'overCapacity',      v_count > loc.comfortable_capacity,
    'businessDate',      v_today,
    'lastUpdatedAt',     occ.last_updated_at,
    'staleAfterMinutes', loc.stale_after_minutes,
    'isStale',           occ.last_updated_at < now() - make_interval(mins => loc.stale_after_minutes),
    'isOpen',            public.is_open_now(p_location_id),
    'tier', case when t.id is null then null else json_build_object(
        'ordinal', t.ordinal, 'label', t.label,
        'description', t.description, 'color', t.color) end,
    'undoable', case
      when v_last.id is null then null
      when v_last.kind in ('undo', 'auto_reset') then null
      when v_last.undone_at is not null then null
      else json_build_object('id', v_last.id, 'kind', v_last.kind,
                             'delta', v_last.delta, 'at', v_last.created_at)
    end
  );
end $$;

-- ---------------------------------------------------------------------------
-- +1 / -1 / +5 / -5. Atomic. Floors at zero (PRD 6.2), but does NOT cap at
-- capacity - 6.2 is explicit that exceeding it is a soft warning, because
-- reality is the source of truth, not the configured number.
-- ---------------------------------------------------------------------------
create or replace function public.staff_apply_delta(
  p_location_id uuid, p_staff_id uuid, p_delta integer)
returns json language plpgsql as $$
declare
  occ   public.current_occupancy;
  v_new integer;
begin
  if p_delta = 0 then raise exception 'invalid_delta' using errcode = '22023'; end if;
  occ   := public.lock_occupancy(p_location_id);
  v_new := greatest(0, occ.current_count + p_delta);

  update public.current_occupancy
     set current_count = v_new, last_updated_at = now(), last_updated_by = p_staff_id
   where location_id = p_location_id;

  insert into public.occupancy_events
    (location_id, staff_id, kind, delta, previous_count, resulting_count, business_date)
  values
    (p_location_id, p_staff_id, 'delta', v_new - occ.current_count,
     occ.current_count, v_new, occ.business_date);

  return public.console_snapshot(p_location_id);
end $$;

-- ---------------------------------------------------------------------------
-- Shift-start reconciliation / fixing accumulated tap errors (PRD 6.2).
-- [PRD-FIX 7] 6.3 rightly demands atomic increments, but "set exact count" is
-- inherently read-modify-write: two managers reconciling at shift change would
-- silently clobber each other. p_expected_prior makes it a compare-and-set, so
-- the loser is told the count moved instead of overwriting blindly.
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_exact(
  p_location_id uuid, p_staff_id uuid, p_new_count integer,
  p_reason text, p_expected_prior integer default null)
returns json language plpgsql as $$
declare occ public.current_occupancy;
begin
  if p_new_count < 0 then raise exception 'negative_count' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  occ := public.lock_occupancy(p_location_id);

  if p_expected_prior is not null and p_expected_prior <> occ.current_count then
    raise exception 'stale_write' using errcode = '40001',
      detail = occ.current_count::text;
  end if;

  update public.current_occupancy
     set current_count = p_new_count, last_updated_at = now(), last_updated_by = p_staff_id
   where location_id = p_location_id;

  insert into public.occupancy_events
    (location_id, staff_id, kind, delta, previous_count, resulting_count, reason_note, business_date)
  values
    (p_location_id, p_staff_id, 'set_exact', p_new_count - occ.current_count,
     occ.current_count, p_new_count, btrim(p_reason), occ.business_date);

  return public.console_snapshot(p_location_id);
end $$;

-- ---------------------------------------------------------------------------
-- [PRD-FIX 2] "The count is still correct" - refreshes freshness without
-- inventing movement. Without this, 9's freshness target forces staff to fake
-- taps during genuinely quiet periods.
-- ---------------------------------------------------------------------------
create or replace function public.staff_confirm(p_location_id uuid, p_staff_id uuid)
returns json language plpgsql as $$
declare occ public.current_occupancy;
begin
  occ := public.lock_occupancy(p_location_id);
  update public.current_occupancy
     set last_updated_at = now(), last_updated_by = p_staff_id
   where location_id = p_location_id;

  insert into public.occupancy_events
    (location_id, staff_id, kind, delta, previous_count, resulting_count, reason_note, business_date)
  values
    (p_location_id, p_staff_id, 'confirm', 0, occ.current_count, occ.current_count,
     'Count confirmed accurate', occ.business_date);

  return public.console_snapshot(p_location_id);
end $$;

-- ---------------------------------------------------------------------------
-- Single-level undo (PRD 6.2).
-- ---------------------------------------------------------------------------
create or replace function public.staff_undo(p_location_id uuid, p_staff_id uuid)
returns json language plpgsql as $$
declare
  occ    public.current_occupancy;
  v_last public.occupancy_events;
begin
  occ := public.lock_occupancy(p_location_id);

  select * into v_last from public.occupancy_events
   where location_id = p_location_id and business_date = occ.business_date
   order by created_at desc, id desc limit 1;

  if not found or v_last.kind in ('undo', 'auto_reset') or v_last.undone_at is not null then
    raise exception 'nothing_to_undo' using errcode = '22023';
  end if;

  update public.occupancy_events set undone_at = now() where id = v_last.id;

  update public.current_occupancy
     set current_count = v_last.previous_count,
         last_updated_at = now(), last_updated_by = p_staff_id
   where location_id = p_location_id;

  insert into public.occupancy_events
    (location_id, staff_id, kind, delta, previous_count, resulting_count, reason_note, business_date)
  values
    (p_location_id, p_staff_id, 'undo', v_last.previous_count - occ.current_count,
     occ.current_count, v_last.previous_count,
     format('Undo of event #%s', v_last.id), occ.business_date);

  return public.console_snapshot(p_location_id);
end $$;
