import 'server-only'
import { db } from './db'
import { env } from './env'

export type LocationRow = {
  id: string
  slug: string
  name: string
  timezone: string
  comfortable_capacity: number
  stale_after_minutes: number
}

/**
 * The location this deployment serves. `location_id` is threaded through
 * everything from day one (PRD §8.2) so adding Bangkok or Pattaya later is a
 * config change rather than a schema migration.
 */
export async function currentLocation(): Promise<LocationRow | null> {
  const { data, error } = await db()
    .from('locations')
    .select('id, slug, name, timezone, comfortable_capacity, stale_after_minutes')
    .eq('slug', env.locationSlug())
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return data as LocationRow
}
