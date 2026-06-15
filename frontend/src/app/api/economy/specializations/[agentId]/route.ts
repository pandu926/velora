import { proxyToBackend } from '../../../proxy'
export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  return proxyToBackend(`/api/economy/specializations/${agentId}`, req)
}
