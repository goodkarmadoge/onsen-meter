'use client'

import { useEffect, useRef, useState } from 'react'
import { CrowdMeter } from './CrowdMeter'
import type { PublicStatus } from '@/lib/types'

const POLL_MS = 45_000 // §7.2: 30-60s. Polling, not websockets, at this scale.

export function LiveMeter({
  initial,
  compact = false,
  onStateChange,
}: {
  initial: PublicStatus | null
  compact?: boolean
  onStateChange?: (status: PublicStatus | null) => void
}) {
  const [status, setStatus] = useState<PublicStatus | null>(initial)
  // Ticks once a minute so "updated 3 min ago" keeps counting up between polls.
  const [now, setNow] = useState(() => Date.now())
  const failures = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/public/status', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as PublicStatus
        if (cancelled) return
        failures.current = 0
        setStatus(data)
        onStateChange?.(data)
      } catch {
        if (cancelled) return
        // One dropped poll is not an outage — a phone waking from sleep drops
        // requests routinely. Only after repeated failures do we admit we no
        // longer know, rather than leaving a stale tier looking live (§7.2).
        failures.current += 1
        if (failures.current >= 3) {
          setStatus(null)
          onStateChange?.(null)
        }
      }
    }

    const pollTimer = setInterval(poll, POLL_MS)
    const clockTimer = setInterval(() => setNow(Date.now()), 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        poll()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(pollTimer)
      clearInterval(clockTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [onStateChange])

  return <CrowdMeter status={status} now={now} compact={compact} />
}
