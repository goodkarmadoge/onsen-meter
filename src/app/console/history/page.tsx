import { redirect } from 'next/navigation'
import { currentStaff } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Today’s log · Counter console',
  robots: { index: false, follow: false },
}

type EventRow = {
  id: number
  kind: string
  delta: number
  previous_count: number
  resulting_count: number
  reason_note: string | null
  undone_at: string | null
  created_at: string
  staff_users: { name: string } | null
}

const KIND_LABEL: Record<string, string> = {
  delta: 'Tap',
  set_exact: 'Manual correction',
  confirm: 'Confirmed accurate',
  undo: 'Undo',
  auto_reset: 'Start-of-day reset',
}

/**
 * The end-of-day view from PRD §6.2 — a manager reconciling against an actual
 * headcount, and the accountability trail every change is attributable through.
 * Internal only; never exposed publicly (§6.2, §8.4).
 */
export default async function HistoryPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/console/login')

  const { data: today } = await db().rpc('venue_business_date', {
    p_location_id: staff.locationId,
  })

  const { data } = await db()
    .from('occupancy_events')
    .select(
      'id, kind, delta, previous_count, resulting_count, reason_note, undone_at, created_at, staff_users(name)',
    )
    .eq('location_id', staff.locationId)
    .eq('business_date', today)
    .order('created_at', { ascending: false })
    .limit(500)

  const events = (data ?? []) as unknown as EventRow[]
  const taps = events.filter((e) => e.kind === 'delta' && !e.undone_at)
  const arrivals = taps.filter((e) => e.delta > 0).reduce((n, e) => n + e.delta, 0)
  const departures = taps.filter((e) => e.delta < 0).reduce((n, e) => n - e.delta, 0)

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <a
        href="/console"
        className="text-xs text-[var(--ink-faint)] underline underline-offset-4"
      >
        ← Back to console
      </a>

      <h1 className="font-display mt-4 text-2xl text-[var(--ink)]">
        Today&rsquo;s log
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {String(today)} · {events.length} recorded {events.length === 1 ? 'change' : 'changes'}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Arrivals recorded" value={arrivals} />
        <Stat label="Departures recorded" value={departures} />
      </div>

      {/*
        Worth watching: at an onsen, arrivals are gated by check-in but
        departures usually are not, so a persistent gap here is the drift the
        widget will eventually show as an inflated tier.
      */}
      {arrivals - departures !== 0 && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
          A widening gap between arrivals and departures usually means exits are
          going unrecorded rather than that the baths are filling up. Recount if
          it looks wrong.
        </p>
      )}

      <ul className="mt-6 divide-y divide-[var(--rule)] overflow-hidden rounded-2xl bg-[var(--cream-card)] ring-1 ring-[var(--rule)]">
        {events.length === 0 && (
          <li className="px-5 py-6 text-sm text-[var(--ink-muted)]">
            Nothing recorded yet today.
          </li>
        )}
        {events.map((e) => (
          <li key={e.id} className="flex items-baseline gap-4 px-5 py-3.5">
            <time className="w-14 shrink-0 text-xs tabular-nums text-[var(--ink-faint)]">
              {new Date(e.created_at).toLocaleTimeString('en-SG', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Singapore',
              })}
            </time>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--ink)]">
                {KIND_LABEL[e.kind] ?? e.kind}
                {e.kind === 'delta' && (
                  <span className="ml-1.5 tabular-nums text-[var(--ink-muted)]">
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                )}
                {e.undone_at && (
                  <span className="ml-2 text-xs text-[var(--ink-faint)]">
                    (undone)
                  </span>
                )}
              </p>
              {e.reason_note && (
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  {e.reason_note}
                </p>
              )}
              <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                {e.staff_users?.name ?? 'System'} · {e.previous_count} →{' '}
                {e.resulting_count}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[var(--cream-card)] px-5 py-4 ring-1 ring-[var(--rule)]">
      <p className="font-display text-3xl tabular-nums text-[var(--ink)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{label}</p>
    </div>
  )
}
