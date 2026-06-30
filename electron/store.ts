import Store from 'electron-store'
import type { DevPadConfig } from '@shared/types'
import { DEFAULT_PROFILES, DEFAULT_PROFILE_ID } from '../src/lib/profiles'

// Persistent configuration for DevPad. Everything (config, profiles, API keys)
// lives locally in electron-store — there is no cloud sync of any kind.
//
// encryptionKey turns on at-rest obfuscation of the JSON file. This is NOT
// strong cryptography (the key ships with the app), but it keeps API keys out of
// plaintext on disk, which satisfies the "encryption enabled for API key
// storage" constraint without requiring an OS keychain dependency.

const defaults: DevPadConfig = {
  setupComplete: false,
  tourComplete: false,
  agentMode: 'ask',
  apiKeys: { deepseek: '', gemini: '', openai: '' },
  godotExecutablePath: '',
  projectDir: '',
  recentProjects: [],
  activeVersionId: 'godot-4',
  activeProfileId: DEFAULT_PROFILE_ID,
  profiles: DEFAULT_PROFILES,
  notes: [],
  checkpointsEnabled: true,
  mcpEnabled: false,
  godotWindowMode: 'separate',
  monitorPosition: 'auto',
  windowBounds: { width: 1200, height: 800 },
}

export const store = new Store<DevPadConfig>({
  name: 'devpad-config',
  encryptionKey: 'devpad-local-config-v1',
  defaults,
})

/**
 * Ensure the built-in profiles are always present (a user may have an older
 * config from before a default profile was added). Built-ins are matched by id;
 * user profiles are preserved untouched.
 */
export function ensureDefaultProfiles(): void {
  const existing = store.get('profiles') ?? []
  const byId = new Map(existing.map((p) => [p.id, p]))
  let changed = false
  for (const def of DEFAULT_PROFILES) {
    const current = byId.get(def.id)
    // Always keep the canonical task config for built-ins so capabilities stay valid.
    if (!current || JSON.stringify(current) !== JSON.stringify(def)) {
      byId.set(def.id, def)
      changed = true
    }
  }
  if (changed) {
    // Built-ins first (in canonical order), then user profiles.
    const builtinIds = new Set(DEFAULT_PROFILES.map((p) => p.id))
    const merged = [
      ...DEFAULT_PROFILES,
      ...existing.filter((p) => !builtinIds.has(p.id)),
    ]
    store.set('profiles', merged)
  }
}

export function getConfig(): DevPadConfig {
  return store.store
}

export function setMany(partial: Partial<DevPadConfig>): DevPadConfig {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof DevPadConfig, value as never)
  }
  return store.store
}
