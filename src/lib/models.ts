import type { ModelDefinition, ModelId, TaskKind } from '@shared/types'

// Capability registry. The router and profile editor both consult this to decide
// which models are eligible for a given task slot (e.g. vision tasks require a
// vision-capable model).
export const MODEL_REGISTRY: Record<ModelId, ModelDefinition> = {
  'deepseek-v3': {
    label: 'DeepSeek V3',
    provider: 'deepseek',
    capabilities: { chat: true, vision: false, code: true },
  },
  'gemini-2.5-pro': {
    label: 'Gemini 2.5 Pro',
    provider: 'gemini',
    capabilities: { chat: true, vision: true, code: true },
  },
  'gemini-2.5-flash': {
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    capabilities: { chat: true, vision: true, code: true },
  },
  'gpt-4o': {
    label: 'GPT-4o',
    provider: 'openai',
    capabilities: { chat: true, vision: true, code: true },
  },
  'gpt-4o-mini': {
    label: 'GPT-4o Mini',
    provider: 'openai',
    capabilities: { chat: true, vision: true, code: true },
  },
  'mcp-claude': {
    label: 'Claude (MCP)',
    provider: 'mcp',
    capabilities: { chat: true, vision: true, code: true },
  },
}

export const ALL_MODEL_IDS = Object.keys(MODEL_REGISTRY) as ModelId[]

/** The capability a task slot requires for a model to be eligible. */
export const TASK_REQUIRED_CAPABILITY: Record<TaskKind, keyof ModelDefinition['capabilities']> = {
  chat: 'chat',
  vision: 'vision',
  vision_to_code: 'code',
  file_analysis: 'code',
}

export function getModel(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY[id as ModelId]
}

export function modelLabel(id: string): string {
  return getModel(id)?.label ?? id
}

/** True when the model is capable of serving the given task slot. */
export function modelSupportsTask(id: string, task: TaskKind): boolean {
  const model = getModel(id)
  if (!model) return false
  return model.capabilities[TASK_REQUIRED_CAPABILITY[task]]
}

/** Models eligible to fill the given task slot, preserving registry order. */
export function modelsForTask(task: TaskKind): ModelId[] {
  return ALL_MODEL_IDS.filter((id) => modelSupportsTask(id, task))
}
