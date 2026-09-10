-- Seed: Yunomori Onsen & Spa, Singapore (PRD 2, 5).
-- Everything here is configuration, not code — a manager can change all of it
-- from the console without a redeploy.

insert into public.locations (slug, name, timezone, comfortable_capacity, stale_after_minutes)
values ('singapore', 'Yunomori Onsen & Spa Singapore', 'Asia/Singapore', 100, 45)
on conflict (slug) do nothing;

-- Operating hours: 10:00-22:00 daily (PRD 2 — "confirm current hours before
-- build"; PRD 12 Q5 still open). Adjustable per day-of-week from settings.
insert into public.operating_hours (location_id, dow, opens_at, closes_at, is_closed)
select l.id, d.dow, time '10:00', time '22:00', false
  from public.locations l
 cross join (select generate_series(0, 6) as dow) d
 where l.slug = 'singapore'
on conflict (location_id, dow) do nothing;

-- The five tiers, verbatim from PRD 5.
-- upper_bound_pct defines a half-open interval: tier N covers
-- (previous bound, this bound]. The top tier also absorbs anything above it.
insert into public.tiers (location_id, ordinal, upper_bound_pct, label, description, color)
select l.id, v.ordinal, v.bound, v.label, v.description, v.color
  from public.locations l
 cross join (values
    (1::smallint,  20.00, 'Serene',      'Quiet right now. Baths are yours to enjoy.',           '#8FA88C'),
    (2::smallint,  40.00, 'Tranquil',    'Gently quiet. A relaxed time to visit.',               '#6E9C93'),
    (3::smallint,  60.00, 'Comfortable', 'Steady flow of guests. Still relaxed.',                '#C8A25C'),
    (4::smallint,  80.00, 'Lively',      'Busier than usual — a sociable, active atmosphere.',   '#C97B4A'),
    (5::smallint, 100.00, 'Bustling',    'Near full capacity. Expect a wait for some baths.',    '#A85C43')
 ) as v(ordinal, bound, label, description, color)
 where l.slug = 'singapore'
on conflict (location_id, ordinal) do nothing;

insert into public.current_occupancy (location_id, current_count, business_date)
select l.id, 0, (now() at time zone l.timezone)::date
  from public.locations l where l.slug = 'singapore'
on conflict (location_id) do nothing;
