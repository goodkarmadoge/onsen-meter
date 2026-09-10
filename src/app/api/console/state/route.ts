import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import type { ConsoleSnapshot } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Current console state. Polled so a second tablet (or the same tablet after
 * waking from sleep) converges on the real count rather than trusting the
 * number it happened to be showing.
 */
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { data, error } = await db().rpc('console_snapshot', {
    p_location_id: staff.locationId,
  })
  if (error || !data) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  return NextResponse.json(data as ConsoleSnapshot, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
