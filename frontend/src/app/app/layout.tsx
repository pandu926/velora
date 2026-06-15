import { Suspense } from 'react'
import { Providers } from '@/components/Providers'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={null}>
        {children}
      </Suspense>
    </Providers>
  )
}
