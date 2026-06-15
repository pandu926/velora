import { proxyToBackend } from '../../proxy'
export async function GET(req: Request) { return proxyToBackend('/api/autonomous/status', req) }
