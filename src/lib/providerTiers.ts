import type { ApiKeys, ProviderId } from '@shared/types'

// ── Provider + tier model registry ───────────────────────────────────────────
//
// THE single source of truth for which concrete model each provider uses at each
// tier, plus the cost/capability data the Adaptive router optimizes over. The
// user picks a provider and a tier (cheap / mild / expensive) and that one model
// handles all AI tasks — OR picks "Adaptive", which routes each task to the
// cheapest model that clears the bar (see adaptivePick below).
//
// Picks were researched for tool-calling reliability + coding capability, not
// just price. Anthropic ids are confident; OpenAI / Gemini / DeepSeek default to
// known-good current ids (newer ids noted inline as one-line swaps).

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
  /**
   * Expected capability for agentic game-building in Zirtola (0–100). Used by the
   * Adaptive router as the quality bar. These are calibrated estimates, tunable.
   */
  capability: number
  /** Approx output price ($ / million tokens) — the Adaptive router's cost axis. */
  cost: number
  /** Short note (price / capability / swap hint) shown next to the selector. */
  note?: string
}

/** Providers that expose cheap/mild/expensive tiers. MCP/Adaptive are separate. */
export type TierProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek'
export const TIER_PROVIDER_IDS: TierProviderId[] = ['anthropic', 'openai', 'gemini', 'deepseek']

/**
 * Proven tool-callers. The Adaptive router keeps a "quality floor": tasks that
 * edit project files only route to these; weaker tool-callers (DeepSeek) are
 * used only for read-only work (chat, planning, triage).
 */
export const PROVIDER_TOOL_RELIABLE: Record<TierProviderId, boolean> = {
  anthropic: true,
  openai: true,
  gemini: true,
  deepseek: false,
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  adaptive: 'Adaptive (auto-pick)',
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  mcp: 'Claude via MCP',
}

export const PROVIDER_TIERS: Record<TierProviderId, Record<TierLevel, TierModel>> = {
  // Anthropic — confident ids (cached 2026-06-24). cost = output $/Mtok.
  anthropic: {
    cheap: { apiModel: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vision: true, capability: 62, cost: 5, note: '$1 / $5 — fast & cheap' },
    mild: { apiModel: 'claude-sonnet-5', label: 'Claude Sonnet 5', vision: true, capability: 88, cost: 15, note: '$3 / $15 ($2/$10 intro) — near-Opus quality' },
    expensive: { apiModel: 'claude-opus-4-8', label: 'Claude Opus 4.8', vision: true, capability: 95, cost: 25, note: '$5 / $25 — top-tier agentic & coding' },
  },
  // OpenAI — safe known-good defaults. To try the newest, swap expensive to gpt-5.5.
  openai: {
    cheap: { apiModel: 'gpt-4o-mini', label: 'GPT-4o mini', vision: true, capability: 55, cost: 1.6 },
    mild: { apiModel: 'gpt-4o', label: 'GPT-4o', vision: true, capability: 80, cost: 10 },
    expensive: { apiModel: 'gpt-4.1', label: 'GPT-4.1', vision: true, capability: 84, cost: 8, note: 'try gpt-5.5 once confirmed' },
  },
  // Gemini — known-good 2.5 tiers. Swap expensive to gemini-3.1-pro when confirmed.
  gemini: {
    cheap: { apiModel: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true, capability: 66, cost: 0.4 },
    mild: { apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true, capability: 82, cost: 10 },
    expensive: { apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true, capability: 82, cost: 10, note: 'try gemini-3.1-pro once confirmed' },
  },
  // DeepSeek — forward-safe V4 ids. Legacy deepseek-chat/reasoner retire 2026-07-24.
  // No vision, weaker tool-calling → Adaptive uses these only for read-only work.
  deepseek: {
    cheap: { apiModel: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, capability: 50, cost: 0.28, note: 'legacy fallback: deepseek-chat' },
    mild: { apiModel: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, capability: 52, cost: 0.28 },
    expensive: { apiModel: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, capability: 68, cost: 0.87, note: 'reasoning; legacy fallback: deepseek-reasoner' },
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
  /** Concrete API model id. Empty for the Adaptive placeholder / 'mcp-claude' for MCP. */
  apiModel: string
  label: string
  vision: boolean
  isMcp: boolean
  isAdaptive: boolean
  note?: string
}

/** Resolve a stored selection to a concrete model (provider + api id + label). */
export function resolveModel(sel: ModelSelection | undefined | null): ResolvedModel {
  const s = sel ?? DEFAULT_SELECTION
  if (s.provider === 'adaptive') {
    return { provider: 'adaptive', tier: null, apiModel: '', label: 'Adaptive', vision: true, isMcp: false, isAdaptive: true }
  }
  if (s.provider === 'mcp') {
    return { provider: 'mcp', tier: null, apiModel: 'mcp-claude', label: 'Claude (via MCP)', vision: true, isMcp: true, isAdaptive: false }
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
    isAdaptive: false,
    note: tm.note,
  }
}

/** Providers that currently have an API key entered. */
export function availableTierProviders(keys: ApiKeys | undefined): TierProviderId[] {
  return TIER_PROVIDER_IDS.filter((p) => providerHasKey(keys, p))
}

/** True when the given provider has an API key configured (MCP needs none). */
export function providerHasKey(keys: ApiKeys | undefined, provider: ProviderId): boolean {
  switch (provider) {
    case 'anthropic':
      return !!keys?.anthropic
    case 'openai':
      return !!keys?.openai
    case 'gemini':
      return !!keys?.gemini
    case 'deepseek':
      return !!keys?.deepseek
    case 'mcp':
      return true
    case 'adaptive':
      // Selectable as soon as any real provider has a key.
      return availableTierProviders(keys).length > 0
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

// ── Adaptive routing ─────────────────────────────────────────────────────────

/** How hard the task is, as judged by the cheap classifier model. */
export type Complexity = 'trivial' | 'simple' | 'moderate' | 'hard'
export const COMPLEXITIES: Complexity[] = ['trivial', 'simple', 'moderate', 'hard']

/** Minimum capability score required at each complexity level. */
const CAPABILITY_THRESHOLD: Record<Complexity, number> = {
  trivial: 45,
  simple: 62,
  moderate: 80,
  hard: 90,
}

export interface AdaptiveInputs {
  /** Providers with a key (candidates to route to). */
  available: TierProviderId[]
  needsVision: boolean
  /** True when fulfilling the task will write/modify project files (quality floor). */
  editsCode: boolean
  complexity: Complexity
}

/**
 * Deterministically pick the cheapest model that clears the quality bar for a
 * task, honoring the vision requirement and the edit-quality floor. Pure — the
 * LLM only supplies `complexity`/`editsCode`/`needsVision`; the cost math is here.
 */
export function adaptivePick(inp: AdaptiveInputs): ResolvedModel {
  type Cand = { provider: TierProviderId; tier: TierLevel } & TierModel

  const build = (opts: { vision: boolean; floor: boolean }): Cand[] => {
    const out: Cand[] = []
    for (const p of inp.available) {
      if (opts.floor && inp.editsCode && !PROVIDER_TOOL_RELIABLE[p]) continue
      for (const t of TIER_LEVELS) {
        const tm = PROVIDER_TIERS[p][t]
        if (opts.vision && inp.needsVision && !tm.vision) continue
        out.push({ provider: p, tier: t, ...tm })
      }
    }
    return out
  }

  // Prefer full constraints; relax the edit floor, then vision, only if the pool
  // would otherwise be empty (using a weak/edit model beats refusing to act).
  let cands = build({ vision: true, floor: true })
  if (cands.length === 0) cands = build({ vision: true, floor: false })
  if (cands.length === 0) cands = build({ vision: false, floor: false })

  const threshold = CAPABILITY_THRESHOLD[inp.complexity]
  const qualifying = cands.filter((c) => c.capability >= threshold)
  const met = qualifying.length > 0
  const pool = met ? qualifying : cands
  // When some models clear the bar: cheapest first (tie-break higher capability).
  // When none do: fall back to the strongest available (tie-break cheaper).
  pool.sort((a, b) =>
    met ? a.cost - b.cost || b.capability - a.capability : b.capability - a.capability || a.cost - b.cost,
  )
  const best = pool[0]
  return {
    provider: best.provider,
    tier: best.tier,
    apiModel: best.apiModel,
    label: best.label,
    vision: best.vision,
    isMcp: false,
    isAdaptive: false,
    note: best.note,
  }
}

/** The cheapest available model to run the Adaptive classifier itself. */
export function classifierModel(
  available: TierProviderId[],
): { provider: TierProviderId; apiModel: string } | null {
  // Prefer reliable, cheap, fast JSON emitters first.
  const order: TierProviderId[] = ['anthropic', 'gemini', 'openai', 'deepseek']
  for (const p of order) {
    if (available.includes(p)) return { provider: p, apiModel: PROVIDER_TIERS[p].cheap.apiModel }
  }
  return null
}
