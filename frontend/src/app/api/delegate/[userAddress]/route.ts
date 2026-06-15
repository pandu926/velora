import { NextRequest } from 'next/server'
import { proxyToBackend } from '../../proxy'

export async function GET(req: NextRequest, { params }: { params: { userAddress: string } }) {
  return proxyToBackend(`/api/delegate/${params.userAddress}`, req)
}
