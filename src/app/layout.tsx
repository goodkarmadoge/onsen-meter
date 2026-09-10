import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'How busy is it? · Yunomori Onsen Singapore',
  description:
    'A live, at-a-glance read on how busy the baths are at Yunomori Onsen & Spa Singapore, so you can choose a calm time to visit.',
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#F5EFE4',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
