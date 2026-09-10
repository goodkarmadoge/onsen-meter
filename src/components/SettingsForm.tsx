'use client'

import { useState } from 'react'

type Tier = {
  ordinal: number
  upperBoundPct: number
  label: string
  description: string
  color: string
}

export function SettingsForm({
  capacity: initialCapacity,
  staleAfterMinutes: initialStale,
  tiers: initialTiers,
}: {
  capacity: number
  staleAfterMinutes: number
  tiers: Tier[]
}) {
  const [capacity, setCapacity] = useState(String(initialCapacity))
  const [stale, setStale] = useState(String(initialStale))
  const [tiers, setTiers] = useState(initialTiers)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  function updateTier(ordinal: number, patch: Partial<Tier>) {
    setTiers((prev) =>
      prev.map((t) => (t.ordinal === ordinal ? { ...t, ...patch } : t)),
    )
  }

  async function save() {
    setStatus('saving')
    setError(null)
    try {
      const res = await fetch('/api/console/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comfortableCapacity: Number(capacity),
          staleAfterMinutes: Number(stale),
          tiers,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? 'Could not save those settings.')
        setStatus('idle')
        return
      }
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setError('No connection. Nothing was saved.')
      setStatus('idle')
    }
  }

  const capacityNum = Number(capacity)

  return (
    <div className="mt-7">
      <Section
        title="Comfortable capacity"
        note="The number of guests at which the baths stop feeling relaxed — deliberately NOT the fire-code maximum. If you use the legal maximum here, “Bustling” will only ever appear when the space is dangerously full, which defeats the point."
      >
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="w-32 rounded-xl bg-[var(--cream)] px-4 py-2.5 text-xl tabular-nums ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
        />
      </Section>

      <Section
        title="Mark the reading stale after"
        note="How long the count can go untouched before guests are told the reading is old, and the console nudges whoever is on shift."
      >
        <div className="flex items-center gap-2.5">
          <input
            type="number"
            min={5}
            value={stale}
            onChange={(e) => setStale(e.target.value)}
            className="w-24 rounded-xl bg-[var(--cream)] px-4 py-2.5 text-xl tabular-nums ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
          />
          <span className="text-sm text-[var(--ink-muted)]">minutes</span>
        </div>
      </Section>

      <Section
        title="Crowd tiers"
        note="Each tier covers everything above the previous tier’s bound up to and including its own. The busiest tier ends at 100% and also absorbs anything above capacity."
      >
        <div className="space-y-3">
          {tiers.map((tier, i) => {
            const lower = i === 0 ? 0 : tiers[i - 1].upperBoundPct
            const guests = Number.isFinite(capacityNum)
              ? Math.round((tier.upperBoundPct / 100) * capacityNum)
              : 0
            return (
              <div
                key={tier.ordinal}
                className="rounded-2xl bg-[var(--cream-card)] p-4 ring-1 ring-[var(--rule)]"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label={`${tier.label} colour`}
                    value={tier.color}
                    onChange={(e) =>
                      updateTier(tier.ordinal, { color: e.target.value })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--rule)] bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    aria-label={`Tier ${tier.ordinal} label`}
                    value={tier.label}
                    onChange={(e) =>
                      updateTier(tier.ordinal, { label: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded-lg bg-[var(--cream)] px-3 py-2 text-[15px] font-medium ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
                  />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs tabular-nums text-[var(--ink-faint)]">
                      {lower}–
                    </span>
                    <input
                      type="number"
                      aria-label={`${tier.label} upper bound percent`}
                      min={0}
                      max={100}
                      value={tier.upperBoundPct}
                      onChange={(e) =>
                        updateTier(tier.ordinal, {
                          upperBoundPct: Number(e.target.value),
                        })
                      }
                      className="w-16 rounded-lg bg-[var(--cream)] px-2 py-2 text-right text-sm tabular-nums ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
                    />
                    <span className="text-xs text-[var(--ink-faint)]">%</span>
                  </div>
                </div>
                <input
                  type="text"
                  aria-label={`${tier.label} guest-facing description`}
                  value={tier.description}
                  onChange={(e) =>
                    updateTier(tier.ordinal, { description: e.target.value })
                  }
                  className="mt-2.5 w-full rounded-lg bg-[var(--cream)] px-3 py-2 text-sm text-[var(--ink-muted)] ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
                />
                <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
                  Shows up to about {guests} guests
                </p>
              </div>
            )
          })}
        </div>
      </Section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[#F6E4DC] px-4 py-3 text-sm text-[#7C3B24] ring-1 ring-[#E4C7BA]"
        >
          {error}
        </p>
      )}

      <div className="mt-7 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={status === 'saving'}
          className="rounded-xl bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--cream-card)] disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save settings'}
        </button>
        {status === 'saved' && (
          <span role="status" className="text-sm text-[var(--ink-muted)]">
            Saved — live for guests now.
          </span>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-medium text-[var(--ink)]">{title}</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--ink-faint)]">
        {note}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  )
}
