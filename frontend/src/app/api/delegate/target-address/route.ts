import { proxyToBackend } from '../../proxy'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  return proxyToBackend('/api/delegate/target-address', req)
}
