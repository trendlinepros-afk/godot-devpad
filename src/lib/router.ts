import type { AiRequest, AiResponse } from '@shared/types'

/**
 * Renderer-side AI router.
 *
 * The ChatPanel imports THIS module only — it never touches provider SDKs or
 * network APIs directly. The actual routing decision and provider calls happen
 * in the Electron main process (see electron/ai/router.ts), which is the only
 * place that can read API keys from electron-store and reach the network.
 *
 * Routing behaviour implemented in the main process:
 *   • screenshot attached →  Step 1: vision model describes the image
 *                            Step 2: vision_to_code model answers using that
 *                                    description + the user's text
 *   • text only           →  chat model
 *   • file analysis       →  file_analysis model
 *   • active profile uses mcp-claude → everything is routed through the local
 *     MCP server on port 3727
 *
 * The active Godot version's aiSystemPrompt is always prepended as the system
 * prompt to every request.
 */
export async function routeMessage(req: AiRequest): Promise<AiResponse> {
  if (!window.devpad?.ai) {
    return {
      ok: false,
      text: '',
      error: 'Zirtola bridge unavailable. Restart the app.',
    }
  }
  try {
    return await window.devpad.ai.send(req)
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
