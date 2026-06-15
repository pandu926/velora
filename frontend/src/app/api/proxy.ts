const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8930'

export async function proxyToBackend(path: string, req: Request): Promise<Response> {
  const incomingUrl = new URL(req.url)
  const queryString = incomingUrl.search
  const url = `${BACKEND_URL}${path}${queryString}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  const init: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { init.body = await req.text() } catch {}
  }

  const res = await fetch(url, init)
  const data = await res.text()
  return new Response(data, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}
