/**
 * OpenAI-compatible client for Venice AI (cx/gpt-5.5).
 *
 * Used for: research, data gathering, debate, self-learning.
 * Venice AI is used ONLY for final Commander decisions.
 */

import { config } from '../config/index.js'

export interface VeniceMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface VeniceChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface VeniceChatResponse {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

export class VeniceInferenceClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string

  constructor(apiKey?: string, model?: string, baseUrl?: string) {
    this.apiKey = apiKey || config.veniceApiKey
    this.model = model || config.veniceInferenceModel
    this.baseUrl = baseUrl || config.veniceBaseUrl
  }

  async chat(
    messages: VeniceMessage[],
    options?: VeniceChatOptions
  ): Promise<VeniceChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Venice API error: ${response.status} ${errorBody}`)
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }

    return {
      content: data.choices[0].message.content,
      usage: data.usage,
    }
  }
}
