import fs from 'node:fs'
import path from 'node:path'
import type {
  AssetKind,
  GenerateAssetRequest,
  GenerateAssetResult,
  SaveAssetResult,
} from '@shared/types'
import { getConfig } from './store'
import { generateImage } from './ai/providers'
import { MissingKeyError } from './ai/providers'

// Asset generation: describe → image, saved straight into the project where
// Godot auto-imports PNGs as textures. Sprites/icons/tilesets get a transparent
// background so they drop into a scene cleanly.

const TRANSPARENT_KINDS: AssetKind[] = ['sprite', 'icon', 'tileset']

function augmentPrompt(kind: AssetKind, prompt: string): string {
  switch (kind) {
    case 'sprite':
      return `A single game sprite of ${prompt}. Centered, full body, clean game art, crisp edges, transparent background, no text, no watermark, no drop shadow.`
    case 'tileset':
      return `A seamless, tileable game texture/tile of ${prompt}. Top-down view, edges align for tiling, clean game art, no text.`
    case 'background':
      return `Game background scene art of ${prompt}. Wide, atmospheric, suitable as a 2D game backdrop, no text, no UI.`
    case 'icon':
      return `A simple game UI icon representing ${prompt}. Bold, readable at small sizes, transparent background, no text.`
    case 'concept':
      return `Game concept art of ${prompt}. Polished illustration.`
  }
}

export async function generateAsset(req: GenerateAssetRequest): Promise<GenerateAssetResult> {
  const key = getConfig().apiKeys.openai
  if (!key) {
    return {
      ok: false,
      needsSettings: true,
      error: 'Asset generation needs an OpenAI API key. Add it in Settings → API Keys.',
    }
  }
  try {
    const base64 = await generateImage(
      augmentPrompt(req.kind, req.prompt),
      req.size || '1024x1024',
      key,
      TRANSPARENT_KINDS.includes(req.kind),
    )
    return { ok: true, base64 }
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return { ok: false, needsSettings: true, error: 'Add an OpenAI API key in Settings.' }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'asset'
  )
}

export function saveAsset(base64: string, name: string): SaveAssetResult {
  const projectDir = getConfig().projectDir
  if (!projectDir || !fs.existsSync(projectDir)) {
    return { ok: false, error: 'No project folder set.' }
  }
  try {
    const dir = path.join(projectDir, 'assets', 'generated')
    fs.mkdirSync(dir, { recursive: true })
    const fileName = `${slugify(name)}-${Date.now().toString(36)}.png`
    const abs = path.join(dir, fileName)
    fs.writeFileSync(abs, Buffer.from(base64, 'base64'))
    return { ok: true, path: abs, resPath: `res://assets/generated/${fileName}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
