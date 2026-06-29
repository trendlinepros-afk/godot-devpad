import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AddonInstallResult } from '@shared/types'
import { getConfig } from './store'

// Installs the Zirtola Bridge addon into the user's Godot project and enables it
// in project.godot, so the editor auto-loads it and connects back to Zirtola.

const ADDON_DIR = 'zirtola_bridge'
const PLUGIN_RES_PATH = `res://addons/${ADDON_DIR}/plugin.cfg`

function addonSourceDir(): string {
  // Packaged: extraResources copies ./resources next to the app.
  // Dev: it sits at the project root (above dist-electron).
  const candidates = [
    path.join(process.resourcesPath ?? '', 'resources', 'godot-addon', ADDON_DIR),
    path.join(app.getAppPath(), 'resources', 'godot-addon', ADDON_DIR),
    path.join(app.getAppPath(), '..', 'resources', 'godot-addon', ADDON_DIR),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return candidates[candidates.length - 1]
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

/**
 * Ensure project.godot has the plugin enabled:
 *   [editor_plugins]
 *   enabled=PackedStringArray("res://addons/zirtola_bridge/plugin.cfg")
 */
function enableInProjectFile(projectDir: string): void {
  const file = path.join(projectDir, 'project.godot')
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''

  if (text.includes(PLUGIN_RES_PATH)) return // already enabled

  if (/\[editor_plugins\]/.test(text)) {
    // There is an editor_plugins section — amend or add its enabled= line.
    if (/enabled\s*=\s*PackedStringArray\(([^)]*)\)/.test(text)) {
      text = text.replace(/enabled\s*=\s*PackedStringArray\(([^)]*)\)/, (_m, inner: string) => {
        const trimmed = inner.trim()
        const next = trimmed.length > 0 ? `${trimmed}, "${PLUGIN_RES_PATH}"` : `"${PLUGIN_RES_PATH}"`
        return `enabled=PackedStringArray(${next})`
      })
    } else {
      text = text.replace(
        /\[editor_plugins\]/,
        `[editor_plugins]\n\nenabled=PackedStringArray("${PLUGIN_RES_PATH}")`,
      )
    }
  } else {
    const section = `\n[editor_plugins]\n\nenabled=PackedStringArray("${PLUGIN_RES_PATH}")\n`
    text = text.trimEnd() + '\n' + section
  }

  fs.writeFileSync(file, text, 'utf-8')
}

export function installAddon(): AddonInstallResult {
  const projectDir = getConfig().projectDir
  if (!projectDir || !fs.existsSync(projectDir)) {
    return { ok: false, error: 'No project folder set. Open or create a project first.' }
  }
  try {
    const src = addonSourceDir()
    if (!fs.existsSync(src)) {
      return { ok: false, error: 'Bundled addon files were not found.' }
    }
    const dest = path.join(projectDir, 'addons', ADDON_DIR)
    copyDir(src, dest)
    enableInProjectFile(projectDir)
    return { ok: true, installed: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
