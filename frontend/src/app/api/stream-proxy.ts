const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8930'

export function proxySSE(backendPath: string): Response {
  const url = `${BACKEND_URL}${backendPath}`

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'text/event-stream' },
        })
        if (!res.body) {
          controller.close()
          return
        }

        const reader = res.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } catch {
        // Connection closed by client or backend
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
