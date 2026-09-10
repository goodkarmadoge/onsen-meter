import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | null = null

/**
 * Every table has RLS enabled with zero policies, so an anon or publishable
 * key can reach the RPCs but silently reads nothing inside them — the
 * functions return null and the widget shows "Unavailable" with no error
 * anywhere. That is a genuinely confusing failure, and easy to hit: Supabase's
 * API page shows the publishable key prominently and hides service_role behind
 * a reveal. So check the key's role up front and say so plainly.
 */
function assertServiceRoleKey(key: string): void {
  let role: string | null = null

  if (key.startsWith('sb_publishable_')) {
    role = 'publishable'
  } else if (key.startsWith('sb_secret_')) {
    return // new-style secret key: correct
  } else {
    const payload = key.split('.')[1]
    if (payload) {
      try {
        role = JSON.parse(Buffer.from(payload, 'base64url').toString()).role
      } catch {
        // Not a JWT we can read; let the request itself fail rather than guess.
        return
      }
    }
  }

  if (role && role !== 'service_role') {
    console.error(
      `[crowd-meter] SUPABASE_SERVICE_ROLE_KEY holds a "${role}" key, not the ` +
        `service_role key. Row-level security will block every read, so the ` +
        `widget will show "Unavailable" even though the database is healthy. ` +
        `Copy the service_role key from Supabase → Project Settings → API.`,
    )
  }
}

export function db(): SupabaseClient {
  if (!client) {
    const key = env.supabaseServiceKey()
    assertServiceRoleKey(key)
    client = createClient(env.supabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

/**
 * Postgres error codes our domain functions raise deliberately, mapped to the
 * HTTP status the API should answer with.
 */
export const DOMAIN_ERRORS: Record<string, { status: number; code: string }> = {
  stale_write: { status: 409, code: 'stale_write' },
  nothing_to_undo: { status: 409, code: 'nothing_to_undo' },
  reason_required: { status: 400, code: 'reason_required' },
  negative_count: { status: 400, code: 'negative_count' },
  invalid_delta: { status: 400, code: 'invalid_delta' },
  unknown_location: { status: 404, code: 'unknown_location' },
}

export type DomainFailure = {
  status: number
  code: string
  /** For stale_write, the count the caller collided with. */
  detail?: string
}

export function classifyDbError(error: {
  message?: string
  details?: string
} | null): DomainFailure {
  const message = error?.message ?? ''
  for (const key of Object.keys(DOMAIN_ERRORS)) {
    if (message.includes(key)) {
      return { ...DOMAIN_ERRORS[key], detail: error?.details ?? undefined }
    }
  }
  return { status: 500, code: 'server_error' }
}
