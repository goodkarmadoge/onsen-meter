'use client'

import { useEffect, useRef } from 'react'

/**
 * Mounts the real `/embed.js` snippet on the test page.
 *
 * The script has to be injected *after* hydration. Rendering a plain
 * `<script src="/embed.js">` in JSX lets it run against the server HTML and
 * insert its iframe before React hydrates, which React then reports as a
 * hydration mismatch. Real host pages never hit this — they are not React
 * apps hydrating this markup — but the test page is, so it mounts the script
 * itself and marks the target as server/client-divergent by design.
 */
export function ScriptEmbedDemo() {
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const script = document.createElement('script')
    script.src = '/embed.js'
    script.async = true
    document.body.appendChild(script)
  }, [])

  return <div id="yunomori-crowd-meter" suppressHydrationWarning />
}
