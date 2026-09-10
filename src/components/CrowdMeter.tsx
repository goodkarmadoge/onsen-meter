import type { PublicStatus } from '@/lib/types'

/**
 * The five-segment meter. PRD §7.2 asks for a visual meter rather than a raw
 * number; the fill is derived from the tier's ordinal, so the graphic never
 * encodes anything finer than the label already says.
 *
 * §7.4: tier is never conveyed by colour alone. Three redundant channels —
 * the written label, the number of filled segments, and the colour.
 */
function Segments({
  filled,
  total,
  color,
  muted,
}: {
  filled: number
  total: number
  color: string
  muted?: boolean
}) {
  return (
    <div
      className="flex gap-1.5"
      role="img"
      aria-label={`${filled} of ${total} on the crowd scale`}
    >
      {Array.from({ length: total }, (_, i) => {
        const on = i < filled
        return (
          <div
            key={i}
            className="h-2.5 flex-1 rounded-full transition-colors duration-700"
            style={{
              backgroundColor: on ? color : 'var(--cream-sunk)',
              opacity: on && muted ? 0.45 : 1,
              // A hairline keeps every segment's edge visible even when a pale
              // tier colour sits on a pale ground.
              boxShadow: 'inset 0 0 0 1px rgba(46,40,34,0.10)',
            }}
          />
        )
      })}
    </div>
  )
}

export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'unknown'
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

function formatOpensAt(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-SG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso))
  } catch {
    return '10:00'
  }
}

/**
 * Renders every state from PRD §7.2's table. Kept as one pure component so the
 * standalone page, the iframe widget, and any future surface stay identical.
 */
export function CrowdMeter({
  status,
  now,
  compact = false,
}: {
  status: PublicStatus | null
  now: number
  compact?: boolean
}) {
  const state = status?.state ?? 'unavailable'

  // ---- Unavailable (§7.2): never a broken layout, never a stale number
  // dressed up as live. A neutral, honest line instead.
  if (!status || state === 'unavailable' || (state !== 'closed' && !status.tier)) {
    return (
      <div className="rounded-2xl bg-[var(--cream-card)] px-6 py-5 ring-1 ring-[var(--rule)]">
        <p className="text-sm text-[var(--ink-muted)]">
          Crowd levels are unavailable right now.
        </p>
      </div>
    )
  }

  // ---- Closed (§7.2)
  if (state === 'closed') {
    return (
      <div className="rounded-2xl bg-[var(--cream-card)] px-6 py-6 ring-1 ring-[var(--rule)]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {status.location.name}
        </p>
        <p className="font-display mt-2 text-2xl text-[var(--ink)]">
          Currently closed
        </p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {status.opensAt
            ? `Opens at ${formatOpensAt(status.opensAt, status.location.timezone)}`
            : 'Opening hours resume shortly.'}
        </p>
      </div>
    )
  }

  const tier = status.tier!
  const isStale = state === 'stale'
  const age = relativeTime(status.lastUpdatedAt, now)

  return (
    <div
      className="rounded-2xl bg-[var(--cream-card)] px-6 py-6 ring-1 ring-[var(--rule)]"
      style={{ opacity: isStale ? 0.92 : 1 }}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {status.location.name}
      </p>

      {/*
        §7.4: polite live region so a screen reader announces a tier change
        without interrupting whatever the guest is reading.
      */}
      <div aria-live="polite" aria-atomic="true">
        <div className="mt-3 flex items-baseline gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{
              backgroundColor: tier.color,
              boxShadow: 'inset 0 0 0 1px rgba(46,40,34,0.15)',
              opacity: isStale ? 0.5 : 1,
            }}
          />
          <h2
            className={`font-display text-[var(--ink)] ${
              compact ? 'text-3xl' : 'text-4xl sm:text-5xl'
            }`}
          >
            {tier.label}
          </h2>
        </div>

        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[var(--ink-muted)]">
          {tier.description}
        </p>
      </div>

      <div className="mt-5">
        <Segments
          filled={tier.ordinal}
          total={tier.of}
          color={tier.color}
          muted={isStale}
        />
      </div>

      {/*
        "Last updated X minutes ago" is shown at all times (§7.2), and becomes
        the loudest thing in the card once the data goes stale.
      */}
      <p
        className={`mt-4 ${
          isStale
            ? 'text-[13px] font-medium text-[var(--ink-muted)]'
            : 'text-xs text-[var(--ink-faint)]'
        }`}
      >
        {isStale ? `As of ${age} — not confirmed since` : `Updated ${age}`}
      </p>
    </div>
  )
}
