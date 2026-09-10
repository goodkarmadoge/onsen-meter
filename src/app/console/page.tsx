import { redirect } from 'next/navigation'
import { Console } from '@/components/Console'
import { currentStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import type { ConsoleSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Counter console',
  robots: { index: false, follow: false },
}

export default async function ConsolePage() {
  const staff = await currentStaff()
  if (!staff) redirect('/console/login')

  const { data, error } = await db().rpc('console_snapshot', {
    p_location_id: staff.locationId,
  })

  if (error || !data) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-sm text-[var(--ink-muted)]">
          Could not load the current count. Refresh to try again.
        </p>
      </main>
    )
  }

  return (
    <main>
      <Console
        initial={data as ConsoleSnapshot}
        staff={{ name: staff.name, role: staff.role }}
      />
    </main>
  )
}
