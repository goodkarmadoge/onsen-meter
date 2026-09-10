-- The public read is specified as unauthenticated (PRD 8.1), so it should not
-- depend on the service-role key. With RLS on and no policies, it previously
-- did: any caller without BYPASSRLS read nothing inside the function and got a
-- silent null back. That made a credential mix-up take down the guest-facing
-- widget, which is the one surface that should degrade least.
--
-- public_status becomes the security boundary instead of the key. It runs as
-- its owner and returns only the sanitised public payload -- tier, freshness,
-- opening hours -- which is exactly what a guest is permitted to see. It still
-- exposes no count and no percentage. search_path is pinned so a definer
-- function cannot be redirected at another schema.
alter function public.public_status(text) security definer;
alter function public.public_status(text) set search_path = public, pg_temp;

-- Conversely, everything that mutates the count or touches staff and audit
-- data must remain reachable only by our own server holding the service-role
-- key. These were executable by anon by default. RLS already blocked their
-- table access, but defence that depends on a single layer is thinner than it
-- needs to be, and the failure mode is silent.
do $revoke$
declare fn text;
begin
  foreach fn in array array[
    'staff_apply_delta(uuid,uuid,integer)',
    'staff_set_exact(uuid,uuid,integer,text,integer)',
    'staff_confirm(uuid,uuid)',
    'staff_undo(uuid,uuid)',
    'lock_occupancy(uuid)',
    'console_snapshot(uuid)',
    'recent_failed_logins(text,integer)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, authenticated', fn);
  end loop;
end $revoke$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, so the
-- revokes above leave that blanket grant in place and the functions stay
-- callable by anon. Revoke from PUBLIC, then grant back only to the role the
-- server actually uses. Verified: anon now gets 42501 permission denied.
do $revoke_public$
declare fn text;
begin
  foreach fn in array array[
    'staff_apply_delta(uuid,uuid,integer)',
    'staff_set_exact(uuid,uuid,integer,text,integer)',
    'staff_confirm(uuid,uuid)',
    'staff_undo(uuid,uuid)',
    'lock_occupancy(uuid)',
    'console_snapshot(uuid)',
    'recent_failed_logins(text,integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role, postgres', fn);
  end loop;
end $revoke_public$;
