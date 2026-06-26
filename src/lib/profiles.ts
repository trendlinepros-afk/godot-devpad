import type { ModelProfile } from '@shared/types'
import { modelSupportsTask } from './models'

// Built-in default profiles. These ship with the app, cannot be deleted, and are
// re-seeded into electron-store on first launch (see electron/store.ts).
export const DEFAULT_PROFILES: ModelProfile[] = [
  {
    id: 'cheap',
    name: 'Cheap Mode',
    isDefault: true,
    tasks: {
      chat: 'deepseek-v3',
      vision: 'gemini-2.5-flash',
      vision_to_code: 'deepseek-v3',
      file_analysis: 'deepseek-v3',
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    isDefault: true,
    tasks: {
      chat: 'deepseek-v3',
      vision: 'gemini-2.5-pro',
      vision_to_code: 'gemini-2.5-pro',
      file_analysis: 'deepseek-v3',
    },
  },
  {
    id: 'quality',
    name: 'Quality',
    isDefault: true,
    tasks: {
      chat: 'gemini-2.5-pro',
      vision: 'gemini-2.5-pro',
      vision_to_code: 'gpt-4o',
      file_analysis: 'gemini-2.5-pro',
    },
  },
  {
    id: 'mcp',
    name: 'MCP Mode',
    isDefault: true,
    tasks: {
      chat: 'mcp-claude',
      vision: 'mcp-claude',
      vision_to_code: 'mcp-claude',
      file_analysis: 'mcp-claude',
    },
  },
]

export const DEFAULT_PROFILE_ID = 'balanced'

export function isBuiltIn(profile: ModelProfile): boolean {
  return profile.isDefault === true
}

export function findProfile(profiles: ModelProfile[], id: string): ModelProfile | undefined {
  return profiles.find((p) => p.id === id)
}

/** A profile is "MCP" when its chat slot routes through the local MCP server. */
export function profileUsesMcp(profile: ModelProfile): boolean {
  return profile.tasks.chat === 'mcp-claude'
}

let counter = 0
/** Generate a reasonably-unique id for a new user profile (no crypto needed). */
export function newProfileId(): string {
  counter += 1
  return `profile-${Date.now().toString(36)}-${counter}`
}

export function duplicateProfile(profile: ModelProfile): ModelProfile {
  return {
    id: newProfileId(),
    name: `${profile.name} (copy)`,
    isDefault: false,
    tasks: { ...profile.tasks },
  }
}

export function emptyProfile(name: string): ModelProfile {
  return {
    id: newProfileId(),
    name,
    isDefault: false,
    tasks: {
      chat: 'deepseek-v3',
      vision: 'gemini-2.5-pro',
      vision_to_code: 'deepseek-v3',
      file_analysis: 'deepseek-v3',
    },
  }
}

/**
 * Validate that every task slot is filled by a model capable of that task.
 * Returns the list of slots that are invalid (empty array = valid).
 */
export function validateProfile(profile: ModelProfile): string[] {
  const invalid: string[] = []
  for (const task of ['chat', 'vision', 'vision_to_code', 'file_analysis'] as const) {
    if (!modelSupportsTask(profile.tasks[task], task)) invalid.push(task)
  }
  return invalid
}
