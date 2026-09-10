'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LiveMeter } from './LiveMeter'
import type { PublicStatus } from '@/lib/types'

/**
 * Wraps the meter for iframe embedding. Reports its rendered height and its
 * current state to the host page via postMessage.
 *
 * [PRD-FIX #11] §7.2 requires the widget to be able to "hide the widget" when
 * unavailable, but an iframe cannot collapse its own parent container. The
 * script embed listens for the `state` message and hides the host element;
 * the bare-iframe fallback can only shrink itself, which is why the fallback
 * degrades to a neutral message rather than disappearing.
 */
export function WidgetFrame({ initial }: { initial: PublicStatus | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<PublicStatus | null>(initial)

  const post = useCallback((message: Record<string, unknown>) => {
    if (window.parent === window) return
    // Targeting '*' is deliberate: the widget is designed to be embedded on
    // any page the venue chooses, and the payload carries no secrets — only
    // a tier label the guest can already see.
    window.parent.postMessage({ source: 'yunomori-crowd-meter', ...message }, '*')
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => post({ type: 'height', height: el.offsetHeight })
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [post])

  useEffect(() => {
    post({ type: 'state', state: status?.state ?? 'unavailable' })
  }, [status, post])

  return (
    <div ref={ref} className="p-1">
      <LiveMeter initial={initial} compact onStateChange={setStatus} />
    </div>
  )
}
