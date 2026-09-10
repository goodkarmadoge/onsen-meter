import 'server-only'
import { db } from './db'
import { env } from './env'
import type { PublicStatus } from './types'

/**
 * Server-side read of the same function the public API serves, so first paint
 * is already correct and the widget never flashes an empty or wrong tier
 * before its first poll lands.
 */
export async function readPublicStatus(): Promise<PublicStatus | null> {
  try {
    const { data, error } = await db().rpc('public_status', {
      p_slug: env.locationSlug(),
    })
    if (error || !data) return null
    return data as PublicStatus
  } catch {
    return null
  }
}
