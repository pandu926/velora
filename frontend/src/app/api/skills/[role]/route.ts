import { proxyToBackend } from '../../proxy'

export async function GET(
  req: Request,
  { params }: { params: { role: string } }
) {
  return proxyToBackend(`/api/agents/skills/${params.role}`, req)
}
