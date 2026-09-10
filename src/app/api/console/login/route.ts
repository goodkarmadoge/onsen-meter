import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  hashClient,
  isThrottled,
  mintSession,
  pinLookup,
  recordAttempt,
  sessionCookieOptions,
  verifyPin,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { currentLocation } from '@/lib/location'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ pin: z.string().min(4).max(12).regex(/^\d+$/) })

/**
 * PIN-only login (PRD §6.2 — "avoid friction that discourages use"). The PIN
 * both identifies and authenticates, POS-style, so this page never publishes a
 * list of staff names.
 *
 * [PRD-FIX #8] §8.1 only says "authenticated". A short PIN with no throttling
 * is trivially brute-forced, which would make the audit log meaningless, so
 * failures are counted per client over a rolling window.
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const ipHash = hashClient(ip)

  if (await isThrottled(ipHash)) {
    return NextResponse.json(
      { error: 'too_many_attempts', message: 'Too many attempts. Wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    await recordAttempt(ipHash, false)
    return NextResponse.json({ error: 'invalid_pin' }, { status: 400 })
  }

  const location = await currentLocation()
  if (!location) {
    return NextResponse.json({ error: 'unknown_location' }, { status: 500 })
  }

  const { data: staff } = await db()
    .from('staff_users')
    .select('id, name, role, pin_hash, is_active')
    .eq('pin_lookup', pinLookup(location.id, parsed.data.pin))
    .maybeSingle()

  // One generic failure for every reason (no such PIN, deactivated staff, bad
  // hash) so the response never confirms that a PIN exists.
  if (!staff || !staff.is_active || !verifyPin(parsed.data.pin, staff.pin_hash)) {
    await recordAttempt(ipHash, false)
    return NextResponse.json(
      { error: 'invalid_pin', message: 'That PIN was not recognised.' },
      { status: 401 },
    )
  }

  await recordAttempt(ipHash, true)

  const response = NextResponse.json({
    staff: { id: staff.id, name: staff.name, role: staff.role },
  })
  response.cookies.set(SESSION_COOKIE, mintSession(staff.id), sessionCookieOptions)
  return response
}
