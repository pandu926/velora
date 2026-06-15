'use client'

import { use } from 'react'
import { SessionChat } from '@/components/SessionChat'

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SessionChat sessionId={id} />
}
