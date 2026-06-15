import { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8930'

export async function GET(req: NextRequest) {
  const proposal = req.nextUrl.searchParams.get('proposal') || ''
  const url = `${BACKEND_URL}/api/agents/boardroom/stream${proposal ? `?proposal=${encodeURIComponent(proposal)}` : ''}`

  const backendRes = await fetch(url, {
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
