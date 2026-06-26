import { desktopCapturer, screen } from 'electron'

// Screenshot capture (main process). We prefer a window whose title contains
// "Godot"; if none is found we fall back to capturing the primary screen. The
// result is a base64-encoded PNG (no data: prefix) ready to hand to a vision
// model or return from the MCP /capture_game_window endpoint.

export interface CaptureResult {
  ok: boolean
  screenshot?: string
  source?: string
  error?: string
}

export async function captureGodotWindow(): Promise<CaptureResult> {
  try {
    const primary = screen.getPrimaryDisplay()
    // Request a thumbnail large enough to be useful to a vision model.
    const thumbnailSize = {
      width: Math.min(1920, primary.size.width),
      height: Math.min(1080, primary.size.height),
    }

    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize,
      fetchWindowIcons: false,
    })

    // 1) Look for a Godot window by title.
    const godotWindow = sources.find(
      (s) => s.name && s.name.toLowerCase().includes('godot'),
    )

    let chosen = godotWindow
    let sourceLabel = godotWindow?.name

    // 2) Fall back to the primary screen capture.
    if (!chosen) {
      chosen =
        sources.find((s) => s.id.startsWith('screen:')) ??
        sources.find((s) => s.name.toLowerCase().includes('screen')) ??
        sources[0]
      sourceLabel = chosen ? `Primary screen (${chosen.name})` : undefined
    }

    if (!chosen) {
      return { ok: false, error: 'No capturable windows or screens were found.' }
    }

    const png = chosen.thumbnail.toPNG()
    if (!png || png.length === 0) {
      return { ok: false, error: 'Capture produced an empty image.' }
    }

    return {
      ok: true,
      screenshot: png.toString('base64'),
      source: sourceLabel,
    }
  } catch (err) {
    return {
      ok: false,
      error: `Screen capture failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
