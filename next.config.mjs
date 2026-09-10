/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // The widget is meant to be iframed by yunomorionsen.com and any page
        // the venue shares it on, so it must stay framable by anyone.
        // Deliberately no X-Frame-Options here: it has no "allow any origin"
        // value, and emitting it empty is worse than omitting it. CSP
        // frame-ancestors supersedes it in every browser that supports both.
        source: '/widget',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        // The staff console must never be framable.
        source: '/console/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}
export default nextConfig
