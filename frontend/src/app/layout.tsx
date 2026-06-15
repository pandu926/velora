import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Velora — Autonomous DeFi Portfolio Intelligence',
  description: '9 AI agents deliberate every move. Adversarial conviction protocol. Autonomous strategy execution on Base via MetaMask Smart Accounts.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-[#030305] text-gray-200 min-h-screen antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
