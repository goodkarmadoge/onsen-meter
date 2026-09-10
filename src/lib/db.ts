import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
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
