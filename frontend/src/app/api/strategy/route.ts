import { proxyToBackend } from '../proxy'
export async function GET(req: Request) { return proxyToBackend('/api/strategy', req) }
export async function PUT(req: Request) { return proxyToBackend('/api/strategy', req) }
