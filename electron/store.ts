import Store from 'electron-store'
import type { DevPadConfig, ProviderId } from '@shared/types'
import { DEFAULT_PROFILES, DEFAULT_PROFILE_ID, findProfile } from '../src/lib/profiles'
import { getModel } from '../src/lib/models'
import { DEFAULT_SELECTION } from '../src/lib/providerTiers'

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
  apiKeys: { deepseek: '', gemini: '', openai: '', anthropic: '' },
  godotExecutablePath: '',
  projectDir: '',
  recentProjects: [],
  activeVersionId: 'godot-4',
  // modelSelection is intentionally NOT defaulted here — migrateConfig() sets it
  // (deriving from an existing install's profile, or DEFAULT_SELECTION for a
  // fresh install) so we can tell "never set" from "set to the default".
  activeProfileId: DEFAULT_PROFILE_ID,
  profiles: DEFAULT_PROFILES,
  notes: [],
  checkpointsEnabled: true,
  mcpEnabled: false,
  godotWindowMode: 'separate',
  monitorPosition: 'auto',
  windowBounds: { width: 1200, height: 800 },
  eulaAcceptedVersion: '',
  trialState: '',
  chatMessages: [],
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

/**
 * One-time config migrations for older installs:
 *  1. Ensure apiKeys has the newer `anthropic` slot (a stored apiKeys object
 *     from before Anthropic support replaces the default wholesale).
 *  2. Seed `modelSelection` (the model control that replaced profiles). Existing
 *     users inherit their old active profile's chat-model provider; fresh
 *     installs get the recommended default (Anthropic / Mild).
 */
export function migrateConfig(): void {
  const keys = store.get('apiKeys') as Partial<DevPadConfig['apiKeys']> | undefined
  if (keys && typeof keys === 'object' && typeof keys.anthropic !== 'string') {
    store.set('apiKeys', {
      deepseek: keys.deepseek ?? '',
      gemini: keys.gemini ?? '',
      openai: keys.openai ?? '',
      anthropic: '',
    })
  }

  if (store.get('modelSelection') === undefined) {
    // An existing install has completed setup; a fresh one has not.
    const existingInstall = store.get('setupComplete') === true
    let selection = DEFAULT_SELECTION
    if (existingInstall) {
      const profile = findProfile(store.get('profiles') ?? [], store.get('activeProfileId') ?? '')
      const provider = profile ? getModel(profile.tasks.chat)?.provider : undefined
      if (provider) selection = { provider: provider as ProviderId, tier: 'mild' }
    }
    store.set('modelSelection', selection)
  }
}

export function getConfig(): DevPadConfig {
  return store.store
}

export function setMany(partial: Partial<DevPadConfig>): DevPadConfig {
  for (const [key, value] of Object.entries(partial)) {
    setKey(key as keyof DevPadConfig, value)
  }
  return store.store
}

/** conf throws on set(key, undefined) — treat undefined as "clear this key". */
export function setKey(key: keyof DevPadConfig, value: unknown): void {
  if (value === undefined) store.delete(key)
  else store.set(key, value as never)
}
