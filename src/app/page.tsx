import { LiveMeter } from '@/components/LiveMeter'
import { readPublicStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

/**
 * The standalone, shareable page (PRD §7.3) — the QR-code destination for the
 * lobby, and what gets pasted into Google Business Profile or social.
 * Mobile-first (§7.4): most pre-visit checks happen on a phone.
 */
export default async function Home() {
  const initial = await readPublicStatus()

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <header className="mb-7">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
          Yunomori Onsen &amp; Spa
        </p>
        <h1 className="font-display mt-2 text-3xl text-[var(--ink)]">
          How busy is it right now?
        </h1>
      </header>

      <LiveMeter initial={initial} />

      <section className="mt-8 rounded-2xl bg-[var(--cream-card)]/60 px-6 py-5 ring-1 ring-[var(--rule)]">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          About this reading
        </h2>
        <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--ink-muted)]">
          Our front desk keeps this count by hand as guests arrive and leave, so
          treat it as an honest guide rather than a precise headcount. If it has
          not been confirmed recently, we say so instead of pretending.
        </p>
      </section>

      <footer className="mt-8 text-center text-xs text-[var(--ink-faint)]">
        <a
          className="underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--ink-muted)]"
          href="https://yunomorionsen.com"
        >
          yunomorionsen.com
        </a>
      </footer>
    </main>
  )
}
