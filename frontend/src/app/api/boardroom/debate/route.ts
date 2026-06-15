import { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8930'

export async function GET(req: NextRequest) {
  const scenario = req.nextUrl.searchParams.get('scenario') || ''
  const profile = req.nextUrl.searchParams.get('profile') || ''
  const params = new URLSearchParams()
  if (scenario) params.set('scenario', scenario)
  if (profile) params.set('profile', profile)
  const qs = params.toString() ? `?${params.toString()}` : ''

  const backendRes = await fetch(`${BACKEND_URL}/api/agents/boardroom/debate${qs}`, {
    headers: { 'Accept': 'text/event-stream' },
  })

  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
