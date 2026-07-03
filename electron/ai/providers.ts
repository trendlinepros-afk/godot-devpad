import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
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
  /**
   * The provider to dispatch to. Set explicitly by the router (from the model
   * selection) so we don't have to infer it from the model-id string. Falls back
   * to providerFor(modelId) when omitted (back-compat).
   */
  provider?: ProviderId
}

export interface ProviderKeys {
  deepseek: string
  gemini: string
  openai: string
  anthropic: string
}

/** Anthropic requires an explicit output cap; ~16k stays under SDK HTTP timeouts. */
const ANTHROPIC_MAX_TOKENS = 16000

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

// ── Anthropic (Claude) ───────────────────────────────────────────────────────

/** Concatenate the text blocks of an Anthropic message response. */
function anthropicText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** Build the user turn's content — a plain string, or text + image blocks. */
function anthropicUserContent(call: ProviderCall): Anthropic.MessageParam['content'] {
  if (call.imageBase64) {
    return [
      ...(call.text ? [{ type: 'text' as const, text: call.text }] : []),
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png' as const, data: call.imageBase64 },
      },
    ]
  }
  return call.text
}

async function callAnthropic(call: ProviderCall, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = []
  for (const h of call.history ?? []) messages.push({ role: h.role, content: h.content })
  messages.push({ role: 'user', content: anthropicUserContent(call) })
  const msg = await client.messages.create({
    model: apiModelName(call.modelId),
    max_tokens: ANTHROPIC_MAX_TOKENS,
    ...(call.systemPrompt ? { system: call.systemPrompt } : {}),
    messages,
  })
  return anthropicText(msg)
}

// ── MCP (route through the local MCP server's /chat relay) ────────────────────

async function callMcp(call: ProviderCall, port: number): Promise<string> {
  const res = await fetch(`http://localhost:${port}/chat`, {
    method: 'POST',
    // Without a timeout a wedged server would leave the chat spinner up forever.
    signal: AbortSignal.timeout(60_000),
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
  const provider = call.provider ?? providerFor(call.modelId)
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
    case 'anthropic':
      if (!keys.anthropic) throw new MissingKeyError('anthropic')
      return callAnthropic(call, keys.anthropic)
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

/** Live activity callback so the UI can show what the AI is doing right now. */
export type ProgressFn = (kind: 'status' | 'tool', text: string) => void

/** Human-readable label for a tool invocation, shown live in the chat. */
function toolLabel(name: string, args: Record<string, unknown>): string {
  if (name === 'read_file') return `Reading ${String(args.path ?? 'a file')}`
  if (name === 'list_files') return `Browsing ${String(args.dir ?? 'the project')}`
  if (name === 'get_godot_errors') return 'Checking the game console for errors'
  return `Running ${name}`
}

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
  {
    type: 'function',
    function: {
      name: 'get_godot_errors',
      description:
        'Get the current errors and warnings from the running Godot game console. Call this to see runtime errors so you can diagnose and fix them.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

async function callOpenAiCompatibleAgentic(
  call: ProviderCall,
  apiKey: string,
  exec: ToolExecutor,
  baseURL?: string,
  onProgress?: ProgressFn,
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL })
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  if (call.systemPrompt) messages.push({ role: 'system', content: call.systemPrompt })
  for (const h of call.history ?? []) messages.push({ role: h.role, content: h.content })
  messages.push({ role: 'user', content: call.text })

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    onProgress?.('status', i === 0 ? 'Thinking…' : 'Working through your project…')
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
        onProgress?.('tool', toolLabel(tc.function.name, args))
        const result = await exec(tc.function.name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: cap(result) })
      }
      continue
    }
    onProgress?.('status', 'Writing response…')
    return msg.content ?? ''
  }
  // Hit the iteration cap — ask for a final answer with no more tools.
  onProgress?.('status', 'Finishing up…')
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
  onProgress?: ProgressFn,
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
          {
            name: 'get_godot_errors',
            description:
              'Get the current errors and warnings from the running Godot game console. Call this to see runtime errors so you can fix them.',
            // @ts-expect-error the SDK accepts string schema types at runtime
            parameters: { type: 'OBJECT', properties: {} },
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
  onProgress?.('status', 'Thinking…')
  let result = await chat.sendMessage(call.text || '')

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const calls = result.response.functionCalls?.() ?? []
    if (!calls || calls.length === 0) {
      onProgress?.('status', 'Writing response…')
      return result.response.text()
    }
    const responses = []
    for (const fc of calls) {
      onProgress?.('tool', toolLabel(fc.name, (fc.args as Record<string, unknown>) ?? {}))
      const out = await exec(fc.name, (fc.args as Record<string, unknown>) ?? {})
      responses.push({ functionResponse: { name: fc.name, response: { result: cap(out) } } })
    }
    result = await chat.sendMessage(responses)
  }
  // Hit the iteration cap and the model may still be requesting tools — a
  // function-call-only response has empty text, so explicitly ask it to answer.
  const text = result.response.text()
  if (text.trim()) return text
  result = await chat.sendMessage('Now give your final answer using what you have read so far.')
  return result.response.text()
}

const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read the UTF-8 contents of a file in the Godot project. Use a res:// or project-relative path (see the PROJECT FILES list).',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'e.g. res://scripts/player.gd' } },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List the files and folders in a project directory.',
    input_schema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'res:// or project-relative dir' } },
    },
  },
  {
    name: 'get_godot_errors',
    description:
      'Get the current errors and warnings from the running Godot game console. Call this to see runtime errors so you can diagnose and fix them.',
    input_schema: { type: 'object', properties: {} },
  },
]

async function callAnthropicAgentic(
  call: ProviderCall,
  apiKey: string,
  exec: ToolExecutor,
  onProgress?: ProgressFn,
): Promise<string> {
  const client = new Anthropic({ apiKey })
  const system = call.systemPrompt || undefined
  const messages: Anthropic.MessageParam[] = []
  for (const h of call.history ?? []) messages.push({ role: h.role, content: h.content })
  messages.push({ role: 'user', content: call.text })

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    onProgress?.('status', i === 0 ? 'Thinking…' : 'Working through your project…')
    const resp = await client.messages.create({
      model: apiModelName(call.modelId),
      max_tokens: ANTHROPIC_MAX_TOKENS,
      ...(system ? { system } : {}),
      tools: ANTHROPIC_TOOLS,
      messages,
    })
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (resp.stop_reason === 'tool_use' && toolUses.length > 0) {
      messages.push({ role: 'assistant', content: resp.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const args = (tu.input ?? {}) as Record<string, unknown>
        onProgress?.('tool', toolLabel(tu.name, args))
        const out = await exec(tu.name, args)
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: cap(out) })
      }
      messages.push({ role: 'user', content: results })
      continue
    }
    onProgress?.('status', 'Writing response…')
    return anthropicText(resp)
  }
  // Hit the iteration cap — ask for a final answer with no more tools.
  onProgress?.('status', 'Finishing up…')
  const final = await client.messages.create({
    model: apiModelName(call.modelId),
    max_tokens: ANTHROPIC_MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: [...messages, { role: 'user', content: 'Now give your final answer.' }],
  })
  return anthropicText(final)
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
  onProgress?: ProgressFn,
): Promise<string> {
  const provider = call.provider ?? providerFor(call.modelId)
  try {
    switch (provider) {
      case 'deepseek':
        if (!keys.deepseek) throw new MissingKeyError('deepseek')
        return await callOpenAiCompatibleAgentic(call, keys.deepseek, exec, 'https://api.deepseek.com', onProgress)
      case 'openai':
        if (!keys.openai) throw new MissingKeyError('openai')
        return await callOpenAiCompatibleAgentic(call, keys.openai, exec, undefined, onProgress)
      case 'gemini':
        if (!keys.gemini) throw new MissingKeyError('gemini')
        return await callGeminiAgentic(call, keys.gemini, exec, onProgress)
      case 'anthropic':
        if (!keys.anthropic) throw new MissingKeyError('anthropic')
        return await callAnthropicAgentic(call, keys.anthropic, exec, onProgress)
      case 'mcp':
        return await callMcp(call, mcpPort)
      default:
        throw new Error(`Unknown provider for model ${call.modelId}`)
    }
  } catch (err) {
    if (err instanceof MissingKeyError) throw err
    // Only fall back to a plain completion when the error suggests the model/
    // endpoint doesn't support tool calling. Rethrowing everything else (rate
    // limits, auth, network) surfaces the REAL error instead of silently
    // re-running the whole request without file access and doubling cost.
    const text = err instanceof Error ? err.message : String(err)
    const toolsUnsupported = /tool|function/i.test(text) && /support|invalid|unknown|unexpected/i.test(text)
    if (!toolsUnsupported) throw err
    console.warn('[ai] tools appear unsupported, falling back to plain completion:', err)
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
      case 'anthropic': {
        if (!keys.anthropic) return { ok: false, message: 'No Anthropic key set.' }
        await callAnthropic(
          { modelId: 'claude-haiku-4-5', systemPrompt: '', text: 'ping', provider: 'anthropic' },
          keys.anthropic,
        )
        return { ok: true, message: 'Anthropic connection OK.' }
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
