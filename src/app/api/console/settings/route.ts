import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireManager } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Manager-only configuration (PRD §6.2 roles, §5 "configurable, not
 * hardcoded", §10 "adjustable without a redeploy").
 */
const Body = z.object({
  comfortableCapacity: z.number().int().min(1).max(100000),
  staleAfterMinutes: z.number().int().min(5).max(24 * 60),
  tiers: z
    .array(
      z.object({
        ordinal: z.number().int().min(1),
        upperBoundPct: z.number().min(0).max(100),
        label: z.string().trim().min(1).max(40),
        description: z.string().trim().min(1).max(200),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
    )
    .min(2)
    .max(9),
})

export async function PUT(request: NextRequest) {
  const staff = await requireManager()
  if (!staff) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { comfortableCapacity, staleAfterMinutes, tiers } = parsed.data

  // Bounds must be strictly ascending or the half-open intervals collapse and
  // some tier becomes unreachable.
  const sorted = [...tiers].sort((a, b) => a.ordinal - b.ordinal)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].upperBoundPct <= sorted[i - 1].upperBoundPct) {
      return NextResponse.json(
        {
          error: 'non_ascending_bounds',
          message: `"${sorted[i].label}" must have a higher upper bound than "${sorted[i - 1].label}".`,
        },
        { status: 400 },
      )
    }
  }
  if (sorted[sorted.length - 1].upperBoundPct !== 100) {
    return NextResponse.json(
      {
        error: 'top_bound_must_be_100',
        message: 'The busiest tier must end at 100%. Counts above capacity fall into it too.',
      },
      { status: 400 },
    )
  }

  const { error: locError } = await db()
    .from('locations')
    .update({
      comfortable_capacity: comfortableCapacity,
      stale_after_minutes: staleAfterMinutes,
    })
    .eq('id', staff.locationId)

  if (locError) return NextResponse.json({ error: 'server_error' }, { status: 500 })

  for (const tier of sorted) {
    const { error } = await db()
      .from('tiers')
      .update({
        upper_bound_pct: tier.upperBoundPct,
        label: tier.label,
        description: tier.description,
        color: tier.color,
      })
      .eq('location_id', staff.locationId)
      .eq('ordinal', tier.ordinal)
    if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
