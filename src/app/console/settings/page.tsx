import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/SettingsForm'
import { currentStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { currentLocation } from '@/lib/location'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Settings · Counter console',
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/console/login')
  if (staff.role !== 'manager') redirect('/console')

  const location = await currentLocation()
  const { data: tiers } = await db()
    .from('tiers')
    .select('ordinal, upper_bound_pct, label, description, color')
    .eq('location_id', staff.locationId)
    .order('ordinal')

  if (!location) redirect('/console')

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <a
        href="/console"
        className="text-xs text-[var(--ink-faint)] underline underline-offset-4"
      >
        ← Back to console
      </a>
      <h1 className="font-display mt-4 text-2xl text-[var(--ink)]">Settings</h1>
      <p className="mt-1 max-w-lg text-sm leading-relaxed text-[var(--ink-muted)]">
        Everything here takes effect immediately, with no redeploy. Tune it once
        you have seen real usage rather than guessing up front.
      </p>

      <SettingsForm
        capacity={location.comfortable_capacity}
        staleAfterMinutes={location.stale_after_minutes}
        tiers={(tiers ?? []).map((t) => ({
          ordinal: t.ordinal,
          upperBoundPct: Number(t.upper_bound_pct),
          label: t.label,
          description: t.description,
          color: t.color,
        }))}
      />
    </main>
  )
}
