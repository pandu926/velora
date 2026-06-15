import { proxyToBackend } from '../../proxy'

export async function GET(req: Request) {
  return proxyToBackend('/api/agents/boardroom/scenarios', req)
}
