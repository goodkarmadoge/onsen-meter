/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // The widget is meant to be iframed by yunomorionsen.com and any
        // page the venue shares it on, so it must NOT inherit a global
        // X-Frame-Options/frame-ancestors deny.
        source: '/widget',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          { key: 'X-Frame-Options', value: '' },
        ],
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
