import { proxyToBackend } from '../../proxy'
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(`/api/sessions/${id}`, req)
}
