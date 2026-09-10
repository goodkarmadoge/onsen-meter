import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logFailure } from '@/lib/status'
import type { PublicStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The public, unauthenticated read endpoint the widget polls (PRD §7.2, §8.1).
 *
 * Returns the tier and freshness only — never the count, never the percentage,
 * never staff identity. Cached at the edge so polling from every guest on the
 * site costs one database read per cache window, not one per visitor (§8.4).
 */
export async function GET() {
  const headers = {
    // Poll cadence is 30-60s (§7.2), so a 30s shared cache collapses the
    // fan-out without ever showing a guest something more than 30s old.
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    // Embedded cross-origin on yunomorionsen.com and anywhere the venue
    // shares the standalone link.
    'Access-Control-Allow-Origin': '*',
  }

  try {
    const { data, error } = await db().rpc('public_status', {
      p_slug: env.locationSlug(),
    })

    if (error || !data) {
      // §7.2 "Unavailable": fail gracefully, and never let a stale number be
      // presented as live. The widget renders a neutral message from this.
      // The cause goes to the server log so an outage is diagnosable.
      //
      // These two branches must stay separate. Collapsing them with
      // `error?.message ?? fallback` makes an error carrying no message look
      // identical to no error at all, which sends you hunting the wrong bug.
      if (error) {
        logFailure(
          'GET /api/public/status',
          `rpc error against ${new URL(env.supabaseUrl()).host} — ` +
            JSON.stringify({
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            }),
        )
      } else {
        logFailure(
          'GET /api/public/status',
          `rpc returned null from ${new URL(env.supabaseUrl()).host} for slug ` +
            `"${env.locationSlug()}" — the function ran but matched no location`,
        )
      }
      return NextResponse.json(
        { state: 'unavailable' },
        { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
      )
    }

    return NextResponse.json(data as PublicStatus, { headers })
  } catch (caught) {
    logFailure('GET /api/public/status', caught)
    return NextResponse.json(
      { state: 'unavailable' },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
