import type { ApiKeys, ProviderId } from '@shared/types'

// ── Provider + tier model registry ───────────────────────────────────────────
//
// THE single source of truth for which concrete model each provider uses at each
// tier. This replaces the old per-task "profiles" system: the user picks a
// provider and a tier (cheap / mild / expensive) and that one model handles all
// AI tasks. To try a different model, edit ONE line here — the exact API model
// id is shown in the UI and verifiable with the per-provider "Test" button, so a
// wrong id surfaces immediately.
//
// Picks were researched for tool-calling reliability + coding capability, not
// just price. Anthropic ids are confident (authoritative reference). OpenAI /
// Gemini / DeepSeek default to KNOWN-GOOD current ids so the app works out of
// the box; newer/aspirational ids are noted inline as one-line swaps to try.

export type TierLevel = 'cheap' | 'mild' | 'expensive'
export const TIER_LEVELS: TierLevel[] = ['cheap', 'mild', 'expensive']
export const TIER_LABELS: Record<TierLevel, string> = {
  cheap: 'Cheap',
  mild: 'Mild',
  expensive: 'Expensive',
}

export interface TierModel {
  /** The exact model id sent to the provider's API. */
  apiModel: string
  /** Human-friendly name shown in the UI. */
  label: string
  /** True when the model can accept image input (drives the vision fallback). */
  vision: boolean
  /** Short note (price / capability / swap hint) shown next to the selector. */
  note?: string
}

/** Providers that expose cheap/mild/expensive tiers. MCP is handled separately. */
export type TierProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek'
export const TIER_PROVIDER_IDS: TierProviderId[] = ['anthropic', 'openai', 'gemini', 'deepseek']

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  mcp: 'Claude via MCP',
}

export const PROVIDER_TIERS: Record<TierProviderId, Record<TierLevel, TierModel>> = {
  // Anthropic — confident ids (cached 2026-06-24). Prices per Mtok (input/output).
  anthropic: {
    cheap: { apiModel: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vision: true, note: '$1 / $5 — fast & cheap' },
    mild: { apiModel: 'claude-sonnet-5', label: 'Claude Sonnet 5', vision: true, note: '$3 / $15 ($2/$10 intro) — near-Opus quality' },
    expensive: { apiModel: 'claude-opus-4-8', label: 'Claude Opus 4.8', vision: true, note: '$5 / $25 — top-tier agentic & coding' },
  },
  // OpenAI — safe known-good defaults. To try the newest, swap to gpt-5.5 / a
  // gpt-5.x tier once you confirm the exact id with the Test button.
  openai: {
    cheap: { apiModel: 'gpt-4o-mini', label: 'GPT-4o mini', vision: true },
    mild: { apiModel: 'gpt-4o', label: 'GPT-4o', vision: true },
    expensive: { apiModel: 'gpt-4.1', label: 'GPT-4.1', vision: true, note: 'try gpt-5.5 once confirmed' },
  },
  // Gemini — known-good 2.5 tiers. To try the newest, swap expensive to
  // gemini-3.1-pro (and cheap to gemini-3.1-flash-lite) after confirming.
  gemini: {
    cheap: { apiModel: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
    mild: { apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
    expensive: { apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true, note: 'try gemini-3.1-pro once confirmed' },
  },
  // DeepSeek — forward-safe V4 ids. NOTE: the legacy `deepseek-chat` /
  // `deepseek-reasoner` aliases retire 2026-07-24; V4 is their successor.
  // DeepSeek has no vision — screenshots use the vision fallback below.
  deepseek: {
    cheap: { apiModel: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, note: 'legacy fallback: deepseek-chat' },
    mild: { apiModel: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false },
    expensive: { apiModel: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, note: 'reasoning; legacy fallback: deepseek-reasoner' },
  },
}

export interface ModelSelection {
  provider: ProviderId
  tier: TierLevel
}

/** Default model on a fresh install (existing users are migrated from profiles). */
export const DEFAULT_SELECTION: ModelSelection = { provider: 'anthropic', tier: 'mild' }

export interface ResolvedModel {
  provider: ProviderId
  tier: TierLevel | null
  /** Concrete API model id. For MCP this is the internal 'mcp-claude' marker. */
  apiModel: string
  label: string
  vision: boolean
  isMcp: boolean
  note?: string
}

/** Resolve a stored selection to a concrete model (provider + api id + label). */
export function resolveModel(sel: ModelSelection | undefined | null): ResolvedModel {
  const s = sel ?? DEFAULT_SELECTION
  if (s.provider === 'mcp') {
    return { provider: 'mcp', tier: null, apiModel: 'mcp-claude', label: 'Claude (via MCP)', vision: true, isMcp: true }
  }
  const table = PROVIDER_TIERS[s.provider as TierProviderId] ?? PROVIDER_TIERS.anthropic
  const tier: TierLevel = TIER_LEVELS.includes(s.tier) ? s.tier : 'mild'
  const tm = table[tier]
  return {
    provider: s.provider,
    tier,
    apiModel: tm.apiModel,
    label: tm.label,
    vision: tm.vision,
    isMcp: false,
    note: tm.note,
  }
}

/** True when the given provider has an API key configured (MCP needs none). */
export function providerHasKey(keys: ApiKeys | undefined, provider: ProviderId): boolean {
  if (!keys) return provider === 'mcp'
  switch (provider) {
    case 'anthropic':
      return !!keys.anthropic
    case 'openai':
      return !!keys.openai
    case 'gemini':
      return !!keys.gemini
    case 'deepseek':
      return !!keys.deepseek
    case 'mcp':
      return true
  }
}

/**
 * A vision-capable model to describe screenshots when the selected model can't
 * (e.g. any DeepSeek tier). Prefers whichever vision provider has a key.
 */
export function visionFallback(
  keys: ApiKeys,
): { provider: ProviderId; apiModel: string; label: string } | null {
  if (keys.gemini) return { provider: 'gemini', apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  if (keys.openai) return { provider: 'openai', apiModel: 'gpt-4o', label: 'GPT-4o' }
  if (keys.anthropic) return { provider: 'anthropic', apiModel: 'claude-sonnet-5', label: 'Claude Sonnet 5' }
  return null
}
