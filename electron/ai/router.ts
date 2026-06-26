import type { AiRequest, AiResponse, ModelProfile } from '@shared/types'
import { getConfig } from '../store'
import { findVersionById } from '../versions'
import { findProfile, DEFAULT_PROFILE_ID } from '../../src/lib/profiles'
import { modelLabel } from '../../src/lib/models'
import { callProvider, MissingKeyError, ProviderKeys } from './providers'

export const MCP_PORT = 3727

// Main-process AI router. This is the canonical implementation of the routing
// rules described in src/lib/router.ts. It runs in the main process so it can
// read API keys from electron-store and reach the network/MCP server.

function activeProfile(): ModelProfile {
  const cfg = getConfig()
  return (
    findProfile(cfg.profiles, cfg.activeProfileId) ??
    findProfile(cfg.profiles, DEFAULT_PROFILE_ID) ??
    cfg.profiles[0]
  )
}

/**
 * Build the shared "project notes" context block from notes the developer has
 * pinned for AI. This gives every model the bigger picture — current state,
 * goals and future plans — on every request.
 */
function notesContext(): string {
  const notes = getConfig().notes ?? []
  const pinned = notes.filter(
    (n) => n.pinnedToAi && (n.title.trim() || n.content.trim()),
  )
  if (pinned.length === 0) return ''
  const blocks = pinned
    .map((n) => `### ${n.title.trim() || 'Untitled note'}\n${n.content.trim()}`)
    .join('\n\n')
  return [
    '',
    '--- PROJECT NOTES (developer-maintained context) ---',
    'The developer keeps these notes about the project — its current state, goals,',
    'and things planned for the future. Use them to understand the bigger picture',
    'and keep your answers consistent with this direction:',
    '',
    blocks,
    '--- END PROJECT NOTES ---',
  ].join('\n')
}

/**
 * The active Godot version's aiSystemPrompt is prepended to every request, with
 * the developer's pinned project notes appended as shared context.
 */
function systemPrompt(): string {
  const cfg = getConfig()
  const versionPrompt = findVersionById(cfg.activeVersionId)?.aiSystemPrompt ?? ''
  return `${versionPrompt}${notesContext()}`
}

function keys(): ProviderKeys {
  return getConfig().apiKeys
}

function missingKeyResponse(err: MissingKeyError): AiResponse {
  const names: Record<string, string> = {
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    openai: 'OpenAI',
  }
  const name = names[err.provider] ?? err.provider
  return {
    ok: false,
    text: '',
    error: `No ${name} API key configured. Add it in **Settings → API Keys** to use this model.`,
    needsSettings: true,
  }
}

/**
 * Route a chat request according to the active profile:
 *   • screenshot   → vision model describes it, then vision_to_code answers
 *   • file analysis→ file_analysis model
 *   • text only    → chat model
 *   • mcp profile  → every slot already resolves to mcp-claude, so all of the
 *                    above naturally flow through the MCP server.
 */
export async function route(req: AiRequest): Promise<AiResponse> {
  const profile = activeProfile()
  const sys = systemPrompt()
  const k = keys()

  try {
    // ── Screenshot: two-step vision → vision_to_code pipeline ───────────────
    if (req.screenshot) {
      const visionModel = profile.tasks.vision
      const v2cModel = profile.tasks.vision_to_code

      // Step 1 — describe the screenshot.
      const description = await callProvider(
        {
          modelId: visionModel,
          systemPrompt: sys,
          text:
            req.text?.trim()
              ? `Describe this Godot editor/game screenshot in detail, focusing on anything relevant to: "${req.text}". Note any visible errors, UI state, node layout, or rendering issues.`
              : 'Describe this Godot editor/game screenshot in detail. Note any visible errors, UI state, node layout, or rendering issues.',
          imageBase64: req.screenshot,
          history: req.history,
        },
        k,
        MCP_PORT,
      )

      // Step 2 — answer using the description + the original message.
      const answer = await callProvider(
        {
          modelId: v2cModel,
          systemPrompt: sys,
          text: [
            'A screenshot of the Godot project was analysed. Here is the description:',
            '',
            description,
            '',
            req.text?.trim()
              ? `The developer asks: ${req.text}`
              : 'Based on this, identify any problems and suggest concrete fixes (with GDScript where relevant).',
          ].join('\n'),
          history: req.history,
        },
        k,
        MCP_PORT,
      )

      return {
        ok: true,
        text: answer,
        modelId: v2cModel,
        modelLabel: modelLabel(v2cModel),
      }
    }

    // ── File analysis ────────────────────────────────────────────────────────
    if (req.fileAnalysis) {
      const model = profile.tasks.file_analysis
      const text = await callProvider(
        { modelId: model, systemPrompt: sys, text: req.text, history: req.history },
        k,
        MCP_PORT,
      )
      return { ok: true, text, modelId: model, modelLabel: modelLabel(model) }
    }

    // ── Text-only chat ────────────────────────────────────────────────────────
    const model = profile.tasks.chat
    const text = await callProvider(
      { modelId: model, systemPrompt: sys, text: req.text, history: req.history },
      k,
      MCP_PORT,
    )
    return { ok: true, text, modelId: model, modelLabel: modelLabel(model) }
  } catch (err) {
    if (err instanceof MissingKeyError) return missingKeyResponse(err)
    return {
      ok: false,
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
