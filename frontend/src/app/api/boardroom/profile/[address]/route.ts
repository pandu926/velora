import { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8930'

export async function GET(req: NextRequest, { params }: { params: { address: string } }) {
  const res = await fetch(`${BACKEND_URL}/api/agents/boardroom/profile/${params.address}`, {
    signal: AbortSignal.timeout(45000),
  })
  const data = await res.text()
  return new Response(data, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}
