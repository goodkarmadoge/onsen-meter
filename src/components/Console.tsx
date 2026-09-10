'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { relativeTime } from './CrowdMeter'
import type { ConsoleSnapshot } from '@/lib/types'
import type { Staff } from '@/lib/auth'

const POLL_MS = 20_000

type Action =
  | { action: 'delta'; delta: 1 | -1 | 5 | -5 }
  | { action: 'set_exact'; count: number; reason: string; expectedPrior: number | null }
  | { action: 'confirm' }
  | { action: 'undo' }

export function Console({
  initial,
  staff,
}: {
  initial: ConsoleSnapshot
  staff: Pick<Staff, 'name' | 'role'>
}) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  // Taps must feel instant (§6.4: under 1 second of interaction), so the
  // displayed count moves immediately and reconciles when the server answers.
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showSetExact, setShowSetExact] = useState(false)
  const inFlight = useRef(0)

  const displayed = Math.max(0, snapshot.count + pending)
  const pct = snapshot.capacity > 0 ? (displayed / snapshot.capacity) * 100 : 0

  const send = useCallback(async (body: Action, optimistic = 0) => {
    setError(null)
    if (optimistic) setPending((p) => p + optimistic)
    inFlight.current += 1
    try {
      const res = await fetch('/api/console/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          router.replace('/console/login')
          return null
        }
        setError(
          data.error === 'stale_write'
            ? `Someone else changed the count to ${data.actualCount} while you were typing. Check the number and try again.`
            : data.error === 'nothing_to_undo'
              ? 'There is nothing left to undo.'
              : 'That did not go through. Try again.',
        )
        return null
      }

      setSnapshot(data as ConsoleSnapshot)
      return data as ConsoleSnapshot
    } catch {
      setError('No connection. The tap was not saved — check wifi and try again.')
      return null
    } finally {
      if (optimistic) setPending((p) => p - optimistic)
      inFlight.current -= 1
    }
  }, [router])

  // Converge on server truth, but never while a tap is in flight — otherwise a
  // poll landing mid-request would briefly rewind the number the staff member
  // just tapped.
  useEffect(() => {
    const poll = async () => {
      if (inFlight.current > 0) return
      try {
        const res = await fetch('/api/console/state', { cache: 'no-store' })
        if (res.status === 401) return router.replace('/console/login')
        if (res.ok && inFlight.current === 0) setSnapshot(await res.json())
      } catch {
        /* a dropped poll is not worth surfacing */
      }
    }
    const a = setInterval(poll, POLL_MS)
    const b = setInterval(() => setNow(Date.now()), 20_000)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [router])

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <Header staff={staff} snapshot={snapshot} />

      {!snapshot.isOpen && <ClosingNotice />}
      {snapshot.isStale && <StaleNotice minutes={snapshot.staleAfterMinutes} />}

      <section className="mt-5 rounded-3xl bg-[var(--cream-card)] px-6 py-7 text-center ring-1 ring-[var(--rule)]">
        <div className="font-display text-[76px] leading-none tabular-nums text-[var(--ink)]">
          {displayed}
        </div>

        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          of {snapshot.capacity} comfortable capacity
          <span className="mx-1.5 text-[var(--ink-faint)]">·</span>
          <span className="tabular-nums">{pct.toFixed(0)}%</span>
        </p>

        {snapshot.tier && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--cream-sunk)] px-3.5 py-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: snapshot.tier.color,
                boxShadow: 'inset 0 0 0 1px rgba(46,40,34,0.15)',
              }}
            />
            <span className="text-sm font-medium text-[var(--ink)]">
              Guests see &ldquo;{snapshot.tier.label}&rdquo;
            </span>
          </p>
        )}

        {/* §6.2: a soft warning, never a hard block — reality is the source of
            truth, not the configured number. */}
        {snapshot.overCapacity && (
          <p className="mt-3 text-sm text-[#8A4A32]">
            Above the configured comfortable capacity. That is fine to record —
            just confirm the number is right.
          </p>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[#F6E4DC] px-4 py-3 text-sm text-[#7C3B24] ring-1 ring-[#E4C7BA]"
        >
          {error}
        </p>
      )}

      {/* Primary taps. Deliberately huge — this is a tablet at a locker desk. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <TapButton label="−1" hint="Guest left" onClick={() => send({ action: 'delta', delta: -1 }, -1)} />
        <TapButton label="+1" hint="Guest arrived" primary onClick={() => send({ action: 'delta', delta: 1 }, 1)} />
      </div>

      {/* §6.2: group check-ins are common at an onsen with lockers and families. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <TapButton label="−5" small onClick={() => send({ action: 'delta', delta: -5 }, -5)} />
        <TapButton label="+5" small onClick={() => send({ action: 'delta', delta: 5 }, 5)} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SecondaryButton
          onClick={() => send({ action: 'confirm' })}
          title="Still accurate"
          subtitle="Refresh the timestamp without changing the count"
        />
        <SecondaryButton
          onClick={() => setShowSetExact(true)}
          title="Set exact count"
          subtitle="Recount and correct any drift"
        />
        <SecondaryButton
          onClick={() => send({ action: 'undo' })}
          disabled={!snapshot.undoable}
          title="Undo last"
          subtitle={
            snapshot.undoable
              ? describeUndoable(snapshot.undoable)
              : 'Nothing to undo'
          }
        />
      </div>

      <p className="mt-6 text-center text-xs text-[var(--ink-faint)]">
        Last change {relativeTime(snapshot.lastUpdatedAt, now)}
        {' · '}
        <a href="/console/history" className="underline underline-offset-4">
          Today&rsquo;s log
        </a>
        {staff.role === 'manager' && (
          <>
            {' · '}
            <a href="/console/settings" className="underline underline-offset-4">
              Settings
            </a>
          </>
        )}
      </p>

      {showSetExact && (
        <SetExactDialog
          currentCount={snapshot.count}
          onCancel={() => setShowSetExact(false)}
          onSubmit={async (count, reason) => {
            const result = await send({
              action: 'set_exact',
              count,
              reason,
              expectedPrior: snapshot.count,
            })
            if (result) setShowSetExact(false)
          }}
        />
      )}
    </div>
  )
}

function describeUndoable(u: NonNullable<ConsoleSnapshot['undoable']>): string {
  if (u.kind === 'set_exact') return 'Reverse the manual correction'
  if (u.kind === 'confirm') return 'Reverse the confirmation'
  return `Reverse ${u.delta > 0 ? '+' : ''}${u.delta}`
}

function Header({
  staff,
  snapshot,
}: {
  staff: Pick<Staff, 'name' | 'role'>
  snapshot: ConsoleSnapshot
}) {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Counter console
        </p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {staff.name}
          <span className="mx-1.5 text-[var(--ink-faint)]">·</span>
          {staff.role === 'manager' ? 'Manager' : 'Operator'}
          <span className="mx-1.5 text-[var(--ink-faint)]">·</span>
          {snapshot.businessDate}
        </p>
      </div>
      <form action="/api/console/logout" method="post">
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/console/logout', { method: 'POST' })
            window.location.href = '/console/login'
          }}
          className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--ink-muted)]"
        >
          Sign out
        </button>
      </form>
    </header>
  )
}

/** §6.3: closing time should make it obvious the day is being closed out. */
function ClosingNotice() {
  return (
    <div className="mt-4 rounded-xl bg-[#EFE7D6] px-4 py-3 text-sm text-[var(--ink-muted)] ring-1 ring-[var(--rule)]">
      <strong className="font-medium text-[var(--ink)]">Outside opening hours.</strong>{' '}
      Guests see &ldquo;Currently closed&rdquo;. Do a final recount before you leave —
      the count resets to zero automatically at tomorrow&rsquo;s opening.
    </div>
  )
}

function StaleNotice({ minutes }: { minutes: number }) {
  return (
    <div className="mt-4 rounded-xl bg-[#F3E7D2] px-4 py-3 text-sm text-[var(--ink-muted)] ring-1 ring-[#E2CFA8]">
      <strong className="font-medium text-[var(--ink)]">
        This count has not been touched in over {minutes} minutes.
      </strong>{' '}
      Guests are being told the reading is old. Confirm it or recount.
    </div>
  )
}

function TapButton({
  label,
  hint,
  onClick,
  primary,
  small,
}: {
  label: string
  hint?: string
  onClick: () => void
  primary?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'select-none rounded-2xl ring-1 transition-transform active:scale-[0.98]',
        small ? 'py-4' : 'py-8',
        primary
          ? 'bg-[var(--ink)] text-[var(--cream-card)] ring-[var(--ink)]'
          : 'bg-[var(--cream-card)] text-[var(--ink)] ring-[var(--rule)]',
      ].join(' ')}
    >
      <span className={small ? 'text-2xl font-medium' : 'text-4xl font-medium'}>
        {label}
      </span>
      {hint && (
        <span
          className={`mt-1 block text-xs ${
            primary ? 'text-[var(--cream-sunk)]/80' : 'text-[var(--ink-faint)]'
          }`}
        >
          {hint}
        </span>
      )}
    </button>
  )
}

function SecondaryButton({
  title,
  subtitle,
  onClick,
  disabled,
}: {
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl bg-[var(--cream-card)] px-4 py-4 text-left ring-1 ring-[var(--rule)] transition-opacity disabled:opacity-45"
    >
      <span className="block text-sm font-medium text-[var(--ink)]">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-[var(--ink-faint)]">
        {subtitle}
      </span>
    </button>
  )
}

/** §6.2: manual override for shift-start reconciliation. Reason is mandatory. */
function SetExactDialog({
  currentCount,
  onCancel,
  onSubmit,
}: {
  currentCount: number
  onCancel: () => void
  onSubmit: (count: number, reason: string) => void
}) {
  const [value, setValue] = useState(String(currentCount))
  const [reason, setReason] = useState('')
  const parsed = Number.parseInt(value, 10)
  const valid = Number.isInteger(parsed) && parsed >= 0 && reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(46,40,34,0.35)] p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-exact-title"
        className="w-full max-w-md rounded-3xl bg-[var(--cream-card)] p-6 ring-1 ring-[var(--rule)]"
      >
        <h2 id="set-exact-title" className="font-display text-2xl text-[var(--ink)]">
          Set exact count
        </h2>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Use this after a recount, at shift change, or when taps have been
          missed. The change is recorded against your name.
        </p>

        <label className="mt-5 block text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          Counted guests
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          className="mt-1.5 w-full rounded-xl bg-[var(--cream)] px-4 py-3 text-2xl tabular-nums text-[var(--ink)] ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
        />

        <label className="mt-4 block text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          Reason (required)
        </label>
        <input
          type="text"
          value={reason}
          placeholder="e.g. Recount at shift change"
          onChange={(e) => setReason(e.target.value)}
          className="mt-1.5 w-full rounded-xl bg-[var(--cream)] px-4 py-3 text-[15px] text-[var(--ink)] ring-1 ring-[var(--rule)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-muted)]"
        />

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-[var(--cream)] py-3 text-sm text-[var(--ink-muted)] ring-1 ring-[var(--rule)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(parsed, reason.trim())}
            className="flex-1 rounded-xl bg-[var(--ink)] py-3 text-sm font-medium text-[var(--cream-card)] disabled:opacity-40"
          >
            Save count
          </button>
        </div>
      </div>
    </div>
  )
}
