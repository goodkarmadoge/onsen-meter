import { redirect } from 'next/navigation'
import { PinPad } from '@/components/PinPad'
import { currentStaff } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sign in · Counter console',
  robots: { index: false, follow: false },
}

export default async function LoginPage() {
  if (await currentStaff()) redirect('/console')

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <header className="mb-7 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Yunomori Onsen
        </p>
        <h1 className="font-display mt-2 text-2xl text-[var(--ink)]">
          Counter console
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Enter your personal PIN
        </p>
      </header>
      <PinPad />
    </main>
  )
}
