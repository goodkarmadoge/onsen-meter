import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaff } from '@/lib/auth'
import { classifyDbError, db } from '@/lib/db'
import type { ConsoleSnapshot } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every count mutation the console can make (PRD §6.2). One endpoint keeps the
 * client trivially simple — the console is a tablet at a busy locker desk, and
 * the interaction budget is under one second per tap (§6.4).
 *
 * The actual arithmetic all happens inside Postgres functions that take a row
 * lock, so two staff tapping at once produce two increments (§6.3) rather than
 * one clobbering the other.
 */
const Body = z.discriminatedUnion('action', [
  // §6.2: +1/-1 primary, +5/-5 for group check-ins common at an onsen.
  z.object({ action: z.literal('delta'), delta: z.union([
    z.literal(1), z.literal(-1), z.literal(5), z.literal(-5),
  ]) }),
  z.object({
    action: z.literal('set_exact'),
    count: z.number().int().min(0).max(100000),
    reason: z.string().trim().min(1).max(280),
    /** Compare-and-set guard — see PRD-FIX #7. */
    expectedPrior: z.number().int().nullable().optional(),
  }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('undo') }),
])

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = parsed.data

  const call = (() => {
    switch (body.action) {
      case 'delta':
        return db().rpc('staff_apply_delta', {
          p_location_id: staff.locationId,
          p_staff_id: staff.id,
          p_delta: body.delta,
        })
      case 'set_exact':
        return db().rpc('staff_set_exact', {
          p_location_id: staff.locationId,
          p_staff_id: staff.id,
          p_new_count: body.count,
          p_reason: body.reason,
          p_expected_prior: body.expectedPrior ?? null,
        })
      case 'confirm':
        return db().rpc('staff_confirm', {
          p_location_id: staff.locationId,
          p_staff_id: staff.id,
        })
      case 'undo':
        return db().rpc('staff_undo', {
          p_location_id: staff.locationId,
          p_staff_id: staff.id,
        })
    }
  })()

  const { data, error } = await call
  if (error) {
    const failure = classifyDbError(error)
    return NextResponse.json(
      {
        error: failure.code,
        // For a stale_write, hand back the count we collided with so the
        // console can show "the count moved to N while you were typing".
        actualCount: failure.code === 'stale_write' ? Number(failure.detail) : undefined,
      },
      { status: failure.status },
    )
  }

  return NextResponse.json(data as ConsoleSnapshot)
}
