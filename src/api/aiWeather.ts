import { getApiBase } from '../lib/native'

export interface AiChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function askWeatherAi(opts: {
  message: string
  context: Record<string, unknown>
  history?: AiChatTurn[]
}): Promise<{ reply: string; model?: string }> {
  const base = getApiBase()
  const res = await fetch(`${base}/api/ai/weather`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      message: opts.message,
      context: opts.context,
      history: opts.history?.slice(-10) ?? [],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `AI request failed (${res.status})`,
    )
  }
  if (typeof data?.reply !== 'string' || !data.reply.trim()) {
    throw new Error('Empty AI reply')
  }
  return { reply: data.reply.trim(), model: data.model }
}
