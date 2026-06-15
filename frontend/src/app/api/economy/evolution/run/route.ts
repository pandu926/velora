import { proxyToBackend } from '../../../proxy'
export async function POST(req: Request) { return proxyToBackend('/api/economy/evolution/run', req) }
