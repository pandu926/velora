import { NextRequest } from 'next/server'
import { proxySSE } from '../../stream-proxy'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get('user') || ''
  return proxySSE(`/api/autonomous/stream${user ? `?user=${user}` : ''}`)
}
