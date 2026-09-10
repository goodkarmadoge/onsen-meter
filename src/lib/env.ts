import 'server-only'

/**
 * Values pasted into a hosting dashboard routinely pick up a trailing newline
 * or a stray space, and a slug or URL that differs only by whitespace fails in
 * a way that looks like a logic bug rather than a typo. Trim everything once,
 * here, so that class of problem cannot happen.
 */
function read(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function required(name: string): string {
  const value = read(name)
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
  /**
   * Which location this deployment serves. Multi-branch ready (PRD §8.2).
   * Lower-cased because the column is a slug: "Singapore" and "singapore"
   * should not be two different branches.
   */
  locationSlug: () => (read('LOCATION_SLUG') ?? 'singapore').toLowerCase(),
}
