import type { GodotVersion, GodotVersionsFile } from '@shared/types'

// Renderer-side helpers for working with the Godot version registry. The actual
// loading / remote-merge logic lives in the main process (electron/versions.ts)
// because it needs filesystem + network access; the renderer receives the parsed
// GodotVersionsFile over IPC.

export function findVersion(file: GodotVersionsFile, id: string): GodotVersion | undefined {
  return file.versions.find((v) => v.id === id)
}

export function activeVersion(
  file: GodotVersionsFile,
  activeId: string,
): GodotVersion | undefined {
  return findVersion(file, activeId) ?? file.versions[0]
}

/**
 * Match a Godot executable filename against the known version hints to
 * auto-detect which version a path corresponds to. Returns the version id or
 * null. Mirrors the detection done in the main process; kept here so the
 * renderer can preview the detected version in Settings.
 */
export function detectVersionFromPath(
  file: GodotVersionsFile,
  executablePath: string,
): string | null {
  if (!executablePath) return null
  const base = executablePath.replace(/\\/g, '/').split('/').pop() ?? executablePath
  const lower = base.toLowerCase()
  for (const v of file.versions) {
    if (v.executableHint && lower.includes(v.executableHint.toLowerCase())) {
      return v.id
    }
  }
  return null
}

export function systemPromptFor(file: GodotVersionsFile, activeId: string): string {
  return activeVersion(file, activeId)?.aiSystemPrompt ?? ''
}
