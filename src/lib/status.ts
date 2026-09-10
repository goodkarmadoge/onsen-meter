import 'server-only'
import { db } from './db'
import { env } from './env'
import type { PublicStatus } from './types'

/**
 * Guests must never see a stack trace, so every failure here degrades to the
 * widget's "Unavailable" state (PRD §7.2). But degrading silently makes an
 * outage undiagnosable — a missing environment variable and a bad service key
 * look identical from outside. So the reason is always logged server-side
 * while the guest still sees the calm fallback.
 */
function logFailure(where: string, detail: unknown): void {
  const message =
    detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail)
  console.error(`[crowd-meter] ${where} failed — ${message}`)
}

export async function readPublicStatus(): Promise<PublicStatus | null> {
  try {
    const { data, error } = await db().rpc('public_status', {
      p_slug: env.locationSlug(),
    })
    if (error) {
      logFailure('public_status rpc', error.message)
      return null
    }
    if (!data) {
      logFailure(
        'public_status rpc',
        `returned no row for slug "${env.locationSlug()}" — is LOCATION_SLUG correct and the location active?`,
      )
      return null
    }
    return data as PublicStatus
  } catch (caught) {
    logFailure('public_status', caught)
    return null
  }
}

export { logFailure }
