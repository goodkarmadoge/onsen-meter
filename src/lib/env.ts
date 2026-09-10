import 'server-only'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: () => required('SUPABASE_URL'),
  /**
   * Service-role key. Every table has RLS enabled with zero policies, so this
   * key is the ONLY way to reach the data — which is deliberate: nothing
   * touches the database except our own route handlers. It must never be
   * exposed to the browser, so it is read lazily and never prefixed NEXT_PUBLIC.
   */
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  /** HMAC secret for staff session cookies. */
  sessionSecret: () => required('SESSION_SECRET'),
  /** Which location this deployment serves. Multi-branch ready (PRD §8.2). */
  locationSlug: () => process.env.LOCATION_SLUG || 'singapore',
}
