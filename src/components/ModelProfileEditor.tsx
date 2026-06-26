import { useEffect, useState } from 'react'
import type { ModelProfile, TaskKind } from '@shared/types'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { ALL_MODEL_IDS, MODEL_REGISTRY, modelSupportsTask } from '../lib/models'
import {
  DEFAULT_PROFILE_ID,
  duplicateProfile,
  emptyProfile,
  isBuiltIn,
  validateProfile,
} from '../lib/profiles'
import { StarIcon, TrashIcon, CopyIcon, PlusIcon, XIcon, CheckIcon } from './Icons'

const TASK_META: { key: TaskKind; label: string; hint: string }[] = [
  { key: 'chat', label: 'Chat', hint: 'Text conversations' },
  { key: 'vision', label: 'Vision', hint: 'Screenshot analysis (vision-capable only)' },
  { key: 'vision_to_code', label: 'Vision → Code', hint: 'Turns a screenshot description into fixes' },
  { key: 'file_analysis', label: 'File Analysis', hint: 'Reasoning over file contents' },
]

interface Props {
  onClose: () => void
}

export function ModelProfileEditor({ onClose }: Props) {
  const { config, update } = useApp()
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<ModelProfile[]>(config?.profiles ?? [])
  const [selectedId, setSelectedId] = useState<string>(
    config?.activeProfileId ?? config?.profiles[0]?.id ?? '',
  )
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (config) setProfiles(config.profiles)
  }, [config])

  if (!config) return null

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0]

  const mutate = (next: ModelProfile[]) => {
    setProfiles(next)
    setDirty(true)
  }

  const updateSelected = (patch: Partial<ModelProfile>) => {
    mutate(profiles.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)))
  }

  const setTask = (task: TaskKind, modelId: string) => {
    updateSelected({ tasks: { ...selected.tasks, [task]: modelId } })
  }

  const addProfile = () => {
    const p = emptyProfile('New Profile')
    mutate([...profiles, p])
    setSelectedId(p.id)
  }

  const duplicate = (p: ModelProfile) => {
    const copy = duplicateProfile(p)
    mutate([...profiles, copy])
    setSelectedId(copy.id)
  }

  const remove = (p: ModelProfile) => {
    if (isBuiltIn(p)) {
      toast('Built-in profiles cannot be deleted.', 'error')
      return
    }
    const next = profiles.filter((x) => x.id !== p.id)
    mutate(next)
    if (selectedId === p.id) setSelectedId(next[0]?.id ?? '')
  }

  const save = async () => {
    // Validate every profile before persisting.
    for (const p of profiles) {
      const invalid = validateProfile(p)
      if (invalid.length > 0) {
        toast(`"${p.name}" has invalid task slots: ${invalid.join(', ')}`, 'error')
        return
      }
      if (!p.name.trim()) {
        toast('Every profile needs a name.', 'error')
        return
      }
    }
    // If the active profile was deleted, fall back to a sensible default.
    const activeStillExists = profiles.some((p) => p.id === config.activeProfileId)
    const patch: Partial<typeof config> = { profiles }
    if (!activeStillExists) {
      patch.activeProfileId = profiles.find((p) => p.id === DEFAULT_PROFILE_ID)?.id ?? profiles[0].id
    }
    await update(patch)
    setDirty(false)
    toast('Profiles saved', 'success')
  }

  const makeActive = async (p: ModelProfile) => {
    await update({ activeProfileId: p.id })
    toast(`"${p.name}" is now the active profile`, 'success')
  }

  return (
    <Modal onClose={onClose} title="Model Profiles">
      <div className="flex h-[32rem]">
        {/* Profile list */}
        <div className="flex w-56 shrink-0 flex-col border-r border-panel-600">
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  p.id === selected?.id ? 'bg-panel-700 text-slate-100' : 'text-slate-300 hover:bg-panel-800'
                }`}
              >
                <span className="w-4">
                  {p.id === config.activeProfileId && (
                    <StarIcon width={13} height={13} className="text-accent-hover" />
                  )}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {isBuiltIn(p) && <span className="text-[10px] text-slate-500">built-in</span>}
              </button>
            ))}
          </div>
          <button
            onClick={addProfile}
            className="flex items-center gap-1.5 border-t border-panel-600 px-3 py-2 text-sm text-accent-hover hover:bg-panel-800"
          >
            <PlusIcon width={14} height={14} /> New Profile
          </button>
        </div>

        {/* Editor */}
        <div className="min-w-0 flex-1 overflow-auto p-4">
          {selected ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  disabled={isBuiltIn(selected)}
                  className="flex-1 rounded-md border border-panel-600 bg-panel-800 px-3 py-1.5 text-sm text-slate-100 focus:border-accent focus:outline-none disabled:opacity-60"
                />
                {selected.id !== config.activeProfileId && (
                  <button
                    onClick={() => makeActive(selected)}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => duplicate(selected)}
                  title="Duplicate"
                  className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-panel-600"
                >
                  <CopyIcon width={15} height={15} />
                </button>
                <button
                  onClick={() => remove(selected)}
                  disabled={isBuiltIn(selected)}
                  title={isBuiltIn(selected) ? 'Built-in profiles cannot be deleted' : 'Delete'}
                  className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-700 text-slate-300 hover:bg-red-900/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <TrashIcon width={15} height={15} />
                </button>
              </div>

              {isBuiltIn(selected) && (
                <p className="mb-3 rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-xs text-slate-400">
                  This is a built-in profile. Duplicate it to make an editable copy.
                </p>
              )}

              <div className="space-y-3">
                {TASK_META.map((task) => (
                  <TaskSlot
                    key={task.key}
                    task={task}
                    value={selected.tasks[task.key]}
                    disabled={isBuiltIn(selected)}
                    onChange={(modelId) => setTask(task.key, modelId)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No profile selected.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-panel-600 px-4 py-3">
        <span className="text-xs text-slate-500">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-panel-600 px-4 py-1.5 text-sm text-slate-300 hover:bg-panel-700"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={!dirty}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <CheckIcon width={15} height={15} /> Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TaskSlot({
  task,
  value,
  disabled,
  onChange,
}: {
  task: { key: TaskKind; label: string; hint: string }
  value: string
  disabled: boolean
  onChange: (modelId: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0">
        <div className="text-sm text-slate-200">{task.label}</div>
        <div className="text-[11px] leading-tight text-slate-500">{task.hint}</div>
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-panel-600 bg-panel-800 px-3 py-1.5 text-sm text-slate-200 focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {ALL_MODEL_IDS.map((id) => {
          const capable = modelSupportsTask(id, task.key)
          return (
            <option key={id} value={id} disabled={!capable}>
              {MODEL_REGISTRY[id].label}
              {capable ? '' : ' — not capable'}
            </option>
          )
        })}
      </select>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-panel-600 bg-panel-850 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-panel-600 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-panel-700 hover:text-slate-200"
          >
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
