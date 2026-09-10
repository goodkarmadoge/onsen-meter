import { WidgetFrame } from '@/components/WidgetFrame'
import { readPublicStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Crowd meter',
  robots: { index: false, follow: false },
}

/**
 * The bare embeddable surface (PRD §7.3). Transparent background so it adopts
 * whatever the host page sits it on; no page chrome of its own.
 */
export default async function Widget() {
  const initial = await readPublicStatus()
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <div className="widget-root">
        <WidgetFrame initial={initial} />
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `html,body{background:transparent;margin:0}`,
        }}
      />
    </>
  )
}
