import { proxyToBackend } from '../../../proxy'

export async function POST(
  req: Request,
  { params }: { params: { role: string } }
) {
  return proxyToBackend(`/api/agents/skills/${params.role}/evolve`, req)
}
