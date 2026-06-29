import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessageInput, ModelId, ProviderId } from '@shared/types'
import { MODEL_REGISTRY } from '../../src/lib/models'

// Provider implementations live in the MAIN process only — this is the single
// place that reads API keys and performs outbound network calls. The renderer
// reaches these exclusively through the IPC bridge (see electron/ai/router.ts).

/** Raised when a provider call needs an API key that isn't configured. */
export class MissingKeyError extends Error {
  constructor(public provider: ProviderId) {
    super(`Missing API key for ${provider}`)
  }
}

export interface ProviderCall {
  modelId: ModelId | string
  systemPrompt: string
  text: string
  /** Base64 PNG (no data: prefix). */
  imageBase64?: string | null
  history?: ChatMessageInput[]
}

export interface ProviderKeys {
  deepseek: string
  gemini: string
  openai: string
}

// Map our internal model ids to the concrete API model names each provider uses.
const API_MODEL_NAME: Record<string, string> = {
  'deepseek-v3': 'deepseek-chat',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
}

export function providerFor(modelId: string): ProviderId {
  return MODEL_REGISTRY[modelId as ModelId]?.provider ?? 'openai'
}

function apiModelName(modelId: string): string {
  return API_MODEL_NAME[modelId] ?? modelId
}

// ── OpenAI-compatible (OpenAI + DeepSeek share the chat-completions shape) ────

async function callOpenAiCompatible(
  call: ProviderCall,
  apiKey: string,
  baseURL?: string,
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL })

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  if (call.systemPrompt) messages.push({ role: 'system', content: call.systemPrompt })
  for (const h of call.history ?? []) {
    messages.push({ role: h.role, content: h.content })
  }

  if (call.imageBase64) {
    messages.push({
      role: 'user',
      content: [
        ...(call.text ? [{ type: 'text' as const, text: call.text }] : []),
        {
          type: 'image_url' as const,
          image_url: { url: `data:image/png;base64,${call.imageBase64}` },
        },
      ],
    })
  } else {
    messages.push({ role: 'user', content: call.text })
  }

  const completion = await client.chat.completions.create({
    model: apiModelName(call.modelId),
    messages,
    temperature: 0.3,
  })
  return completion.choices[0]?.message?.content ?? ''
}

// ── Gemini (Google Generative AI SDK) ────────────────────────────────────────

async function callGemini(call: ProviderCall, apiKey: string): Promise<string> {
  const genai = new GoogleGenerativeAI(apiKey)
  const model = genai.getGenerativeModel({
    model: apiModelName(call.modelId),
    systemInstruction: call.systemPrompt || undefined,
  })

  const history = (call.history ?? []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }))

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []
  if (call.text) parts.push({ text: call.text })
  if (call.imageBase64) {
    parts.push({ inlineData: { mimeType: 'image/png', data: call.imageBase64 } })
  }
  if (parts.length === 0) parts.push({ text: '' })

  const chat = model.startChat({ history })
  const result = await chat.sendMessage(parts)
  return result.response.text()
}

// ── MCP (route through the local MCP server's /chat relay) ────────────────────

async function callMcp(call: ProviderCall, port: number): Promise<string> {
  const res = await fetch(`http://localhost:${port}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: call.systemPrompt,
      text: call.text,
      imageBase64: call.imageBase64 ?? null,
      history: call.history ?? [],
    }),
  })
  if (!res.ok) {
    throw new Error(`MCP server responded ${res.status}. Is it enabled in Settings?`)
  }
  const data = (await res.json()) as { text?: string; error?: string }
  if (data.error) throw new Error(data.error)
  return data.text ?? ''
}

/**
 * Dispatch a single provider call. Throws MissingKeyError when the required key
 * is absent so the router can surface an inline "go to Settings" message.
 */
export async function callProvider(
  call: ProviderCall,
  keys: ProviderKeys,
  mcpPort: number,
): Promise<string> {
  const provider = providerFor(call.modelId)
  switch (provider) {
    case 'deepseek':
      if (!keys.deepseek) throw new MissingKeyError('deepseek')
      return callOpenAiCompatible(call, keys.deepseek, 'https://api.deepseek.com')
    case 'openai':
      if (!keys.openai) throw new MissingKeyError('openai')
      return callOpenAiCompatible(call, keys.openai)
    case 'gemini':
      if (!keys.gemini) throw new MissingKeyError('gemini')
      return callGemini(call, keys.gemini)
    case 'mcp':
      return callMcp(call, mcpPort)
    default:
      throw new Error(`Unknown provider for model ${call.modelId}`)
  }
}

/**
 * Generate an image from a text prompt via OpenAI's image model. Returns a
 * base64 PNG. `transparent` requests a transparent background (sprites/icons).
 */
export async function generateImage(
  prompt: string,
  size: string,
  apiKey: string,
  transparent: boolean,
): Promise<string> {
  if (!apiKey) throw new MissingKeyError('openai')
  const client = new OpenAI({ apiKey })
  const result = await client.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: size as '1024x1024' | '1024x1536' | '1536x1024',
    n: 1,
    ...(transparent ? { background: 'transparent' } : {}),
  })
  const b64 = result.data?.[0]?.b64_json
  if (!b64) throw new Error('The image model returned no image.')
  return b64
}

/** Lightweight connectivity ping used by the "Test Connection" buttons. */
export async function testProvider(
  provider: ProviderId,
  keys: ProviderKeys,
): Promise<{ ok: boolean; message: string }> {
  try {
    switch (provider) {
      case 'deepseek': {
        if (!keys.deepseek) return { ok: false, message: 'No DeepSeek key set.' }
        await callOpenAiCompatible(
          { modelId: 'deepseek-v3', systemPrompt: '', text: 'ping' },
          keys.deepseek,
          'https://api.deepseek.com',
        )
        return { ok: true, message: 'DeepSeek connection OK.' }
      }
      case 'openai': {
        if (!keys.openai) return { ok: false, message: 'No OpenAI key set.' }
        await callOpenAiCompatible(
          { modelId: 'gpt-4o-mini', systemPrompt: '', text: 'ping' },
          keys.openai,
        )
        return { ok: true, message: 'OpenAI connection OK.' }
      }
      case 'gemini': {
        if (!keys.gemini) return { ok: false, message: 'No Gemini key set.' }
        await callGemini(
          { modelId: 'gemini-2.5-flash', systemPrompt: '', text: 'ping' },
          keys.gemini,
        )
        return { ok: true, message: 'Gemini connection OK.' }
      }
      default:
        return { ok: false, message: 'MCP does not require an API key.' }
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
