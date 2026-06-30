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

// ── Agentic tool-calling (the AI reads project files itself) ─────────────────
//
// Tools are READ-ONLY (read_file / list_files), confined to the project by the
// executor in router.ts. Edits still happen via the zirtola-edit / zirtola-scene
// block protocol so the user's Ask/Auto mode governs writes. If a model/provider
// errors on tools, we fall back to a plain (toolless) completion.

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>

const MAX_TOOL_ITERS = 8
const TOOL_RESULT_CAP = 40000

function cap(s: string): string {
  return s.length > TOOL_RESULT_CAP ? s.slice(0, TOOL_RESULT_CAP) + '\n…(truncated)' : s
}

const OPENAI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the UTF-8 contents of a file in the Godot project. Use a res:// or project-relative path (see the PROJECT FILES list).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'e.g. res://scripts/player.gd' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List the files and folders in a project directory.',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string', description: 'res:// or project-relative dir' } },
      },
    },
  },
]

async function callOpenAiCompatibleAgentic(
  call: ProviderCall,
  apiKey: string,
  exec: ToolExecutor,
  baseURL?: string,
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL })
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  if (call.systemPrompt) messages.push({ role: 'system', content: call.systemPrompt })
  for (const h of call.history ?? []) messages.push({ role: h.role, content: h.content })
  messages.push({ role: 'user', content: call.text })

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const completion = await client.chat.completions.create({
      model: apiModelName(call.modelId),
      messages,
      tools: OPENAI_TOOLS,
      temperature: 0.3,
    })
    const msg = completion.choices[0]?.message
    if (!msg) return ''
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg)
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          /* ignore malformed args */
        }
        const result = await exec(tc.function.name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: cap(result) })
      }
      continue
    }
    return msg.content ?? ''
  }
  // Hit the iteration cap — ask for a final answer with no more tools.
  const final = await client.chat.completions.create({
    model: apiModelName(call.modelId),
    messages: [...messages, { role: 'user', content: 'Now give your final answer.' }],
    temperature: 0.3,
  })
  return final.choices[0]?.message?.content ?? ''
}

async function callGeminiAgentic(
  call: ProviderCall,
  apiKey: string,
  exec: ToolExecutor,
): Promise<string> {
  const genai = new GoogleGenerativeAI(apiKey)
  const model = genai.getGenerativeModel({
    model: apiModelName(call.modelId),
    systemInstruction: call.systemPrompt || undefined,
    tools: [
      {
        functionDeclarations: [
          {
            name: 'read_file',
            description: 'Read the UTF-8 contents of a project file (res:// or relative path).',
            // @ts-expect-error the SDK accepts string schema types at runtime
            parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] },
          },
          {
            name: 'list_files',
            description: 'List files/folders in a project directory.',
            // @ts-expect-error the SDK accepts string schema types at runtime
            parameters: { type: 'OBJECT', properties: { dir: { type: 'STRING' } } },
          },
        ],
      },
    ],
  })

  const history = (call.history ?? []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }))
  const chat = model.startChat({ history })
  let result = await chat.sendMessage(call.text || '')

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const calls = result.response.functionCalls?.() ?? []
    if (!calls || calls.length === 0) return result.response.text()
    const responses = []
    for (const fc of calls) {
      const out = await exec(fc.name, (fc.args as Record<string, unknown>) ?? {})
      responses.push({ functionResponse: { name: fc.name, response: { result: cap(out) } } })
    }
    result = await chat.sendMessage(responses)
  }
  return result.response.text()
}

/**
 * Provider call WITH read-only file tools. Used for text tasks so the AI can
 * pull file contents on its own. Falls back to a plain call on any error.
 */
export async function callProviderAgentic(
  call: ProviderCall,
  keys: ProviderKeys,
  mcpPort: number,
  exec: ToolExecutor,
): Promise<string> {
  const provider = providerFor(call.modelId)
  try {
    switch (provider) {
      case 'deepseek':
        if (!keys.deepseek) throw new MissingKeyError('deepseek')
        return await callOpenAiCompatibleAgentic(call, keys.deepseek, exec, 'https://api.deepseek.com')
      case 'openai':
        if (!keys.openai) throw new MissingKeyError('openai')
        return await callOpenAiCompatibleAgentic(call, keys.openai, exec)
      case 'gemini':
        if (!keys.gemini) throw new MissingKeyError('gemini')
        return await callGeminiAgentic(call, keys.gemini, exec)
      case 'mcp':
        return await callMcp(call, mcpPort)
      default:
        throw new Error(`Unknown provider for model ${call.modelId}`)
    }
  } catch (err) {
    if (err instanceof MissingKeyError) throw err
    // Tool calling may be unsupported or transiently fail — fall back to plain.
    console.warn('[ai] agentic call failed, falling back to plain completion:', err)
    return callProvider(call, keys, mcpPort)
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
