'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PIN_LENGTH = 6

/**
 * An on-screen keypad rather than a text field: the console lives on a shared
 * tablet at the locker desk, and a numeric pad is faster than summoning a soft
 * keyboard (PRD §6.4 — no login friction beyond an initial PIN).
 */
export function PinPad() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(value: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/console/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      })
      if (res.ok) {
        router.replace('/console')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? 'That PIN was not recognised.')
      setPin('')
    } catch {
      setError('No connection. Check wifi and try again.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  function press(digit: string) {
    if (busy || pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setError(null)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  return (
    <div>
      <div
        className="flex justify-center gap-2.5"
        role="status"
        aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full ring-1 ring-[var(--rule)]"
            style={{
              backgroundColor:
                i < pin.length ? 'var(--ink)' : 'var(--cream-card)',
            }}
          />
        ))}
      </div>

      <p role="alert" className="mt-4 h-5 text-center text-sm text-[#8A4A32]">
        {error}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={busy}>
            {d}
          </Key>
        ))}
        <Key
          onClick={() => {
            setPin('')
            setError(null)
          }}
          disabled={busy}
          muted
        >
          Clear
        </Key>
        <Key onClick={() => press('0')} disabled={busy}>
          0
        </Key>
        <Key onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} muted>
          <span aria-hidden="true">⌫</span>
          <span className="sr-only">Delete</span>
        </Key>
      </div>
    </div>
  )
}

function Key({
  children,
  onClick,
  disabled,
  muted,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-2xl py-5 ring-1 ring-[var(--rule)] transition-transform active:scale-[0.97] disabled:opacity-50',
        muted
          ? 'bg-transparent text-sm text-[var(--ink-muted)]'
          : 'bg-[var(--cream-card)] text-2xl font-medium text-[var(--ink)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
