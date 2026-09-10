import { headers } from 'next/headers'
import { ScriptEmbedDemo } from '@/components/ScriptEmbedDemo'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Embed test page',
  robots: { index: false, follow: false },
}

/**
 * The test page from PRD §7.5: proves the widget embeds via BOTH the script
 * method and the plain-iframe fallback, side by side, on a page that is not
 * the widget's own origin styling.
 */
export default function EmbedDemo() {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${proto}://${host}`

  const scriptSnippet = `<div id="yunomori-crowd-meter"></div>
<script src="${origin}/embed.js" async></script>`

  const iframeSnippet = `<iframe
  src="${origin}/widget"
  title="How busy is Yunomori Onsen right now"
  style="width:100%;max-width:420px;height:230px;border:0"
  loading="lazy"
></iframe>`

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-display text-2xl text-[var(--ink)]">
        Embed test page
      </h1>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">
        Both delivery methods from §7.3, rendering live. The script embed
        auto-sizes to its content and can hide itself entirely if the backend is
        unavailable; the plain iframe cannot resize its host, so it degrades to a
        neutral message instead. Use the iframe if the site&rsquo;s platform
        blocks custom scripts.
      </p>

      <section className="mt-9">
        <h2 className="text-sm font-medium text-[var(--ink)]">
          1 · Script embed (preferred)
        </h2>
        <Snippet code={scriptSnippet} />
        <div className="mt-4 rounded-2xl bg-[var(--cream-sunk)] p-5">
          <ScriptEmbedDemo />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-[var(--ink)]">
          2 · Plain iframe (universal fallback)
        </h2>
        <Snippet code={iframeSnippet} />
        <div className="mt-4 rounded-2xl bg-[var(--cream-sunk)] p-5">
          <iframe
            src="/widget"
            title="How busy is Yunomori Onsen right now"
            style={{ width: '100%', maxWidth: 420, height: 230, border: 0 }}
            loading="lazy"
          />
        </div>
      </section>
    </main>
  )
}

function Snippet({ code }: { code: string }) {
  return (
    <pre className="mt-2.5 overflow-x-auto rounded-xl bg-[var(--ink)] px-4 py-3.5 text-xs leading-relaxed text-[#E6DDCE]">
      <code>{code}</code>
    </pre>
  )
}
