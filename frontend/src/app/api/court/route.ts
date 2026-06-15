import { proxyToBackend } from '../proxy'

export async function POST(req: Request) {
  return proxyToBackend('/api/agents/court', req)
}

export async function GET(req: Request) {
  return proxyToBackend('/api/agents/court', req)
}
