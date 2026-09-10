import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * The script embed (PRD §7.3, primary delivery).
 *
 *   <div id="yunomori-crowd-meter"></div>
 *   <script src="https://<host>/embed.js" async></script>
 *
 * Renders into an isolated iframe so nothing on yunomorionsen.com can inherit
 * from or clash with the widget's CSS, whatever platform the site turns out to
 * run on (§7.3 flags the CMS as unknown and a real timeline risk).
 *
 * Unlike the bare-iframe fallback, this version can auto-size to content and
 * can hide the host container outright when the backend is unavailable, which
 * is what §7.2 asks for.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin

  const script = `(function () {
  'use strict';
  var ORIGIN = ${JSON.stringify(origin)};
  var TARGET_ID = 'yunomori-crowd-meter';

  function mount(host) {
    if (host.getAttribute('data-yco-mounted')) return;
    host.setAttribute('data-yco-mounted', '1');

    var frame = document.createElement('iframe');
    frame.src = ORIGIN + '/widget';
    frame.title = 'How busy is Yunomori Onsen right now';
    frame.loading = 'lazy';
    frame.setAttribute('scrolling', 'no');
    frame.style.cssText =
      'width:100%;border:0;display:block;overflow:hidden;height:210px;' +
      'transition:height .25s ease;color-scheme:normal;';
    host.appendChild(frame);

    window.addEventListener('message', function (event) {
      if (event.origin !== ORIGIN) return;
      var data = event.data;
      if (!data || data.source !== 'yunomori-crowd-meter') return;

      if (data.type === 'height' && typeof data.height === 'number') {
        frame.style.height = Math.max(80, Math.ceil(data.height)) + 'px';
      }

      // §7.2 Unavailable: hide rather than show a broken or misleading card.
      // Only the script embed can do this, because only it owns the container.
      if (data.type === 'state') {
        var hide = data.state === 'unavailable';
        host.style.display = hide ? 'none' : '';
      }
    });
  }

  function init() {
    var hosts = document.querySelectorAll(
      '#' + TARGET_ID + ', [data-yunomori-crowd-meter]'
    );
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
