import { useState } from 'react'
import { useApp } from '../state/app'
import { detectVersionFromPath } from '../lib/godot-versions'
import { GodotSetup } from './GodotSetup'
import { CheckIcon } from './Icons'

// Shown on first launch when no config exists. Walks through project folder,
// Godot executable, and API keys. Skippable after step 3 (the executable step);
// API keys can always be added later in Settings.

interface Props {
  onDone: () => void
}

const inputClass =
  'w-full rounded-md border border-panel-600 bg-panel-800 px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none'

export function SetupWizard({ onDone }: Props) {
  const { config, versions, update } = useApp()
  const [step, setStep] = useState(1)
  const [projectDir, setProjectDir] = useState(config?.projectDir ?? '')
  const [exePath, setExePath] = useState(config?.godotExecutablePath ?? '')
  const [keys, setKeys] = useState(
    config?.apiKeys ?? { deepseek: '', gemini: '', openai: '', anthropic: '' },
  )

  const totalSteps = 5

  const pickFolder = async () => {
    const path = await window.devpad.dialog.pickFolder({ title: 'Select your Godot project folder' })
    if (path) setProjectDir(path)
  }

  const recents = (dir: string) => (dir ? [dir] : [])

  const finish = async () => {
    const detected = versions ? detectVersionFromPath(versions, exePath) : null
    await update({
      projectDir,
      recentProjects: recents(projectDir),
      godotExecutablePath: exePath,
      apiKeys: keys,
      setupComplete: true,
      ...(detected ? { activeVersionId: detected } : {}),
    })
    onDone()
  }

  const skip = async () => {
    // Persist whatever has been entered so far and jump into the app.
    await update({
      projectDir,
      recentProjects: recents(projectDir),
      godotExecutablePath: exePath,
      apiKeys: keys,
      setupComplete: true,
    })
    onDone()
  }

  const canSkip = step >= 3

  return (
    <div className="flex h-full items-center justify-center bg-panel-900 p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-panel-600 bg-panel-850 shadow-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 border-b border-panel-600 px-6 py-4">
          <span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm font-bold text-white">
            Z
          </span>
          <span className="font-semibold text-slate-100">Zirtola Setup</span>
          <div className="flex-1" />
          <span className="text-xs text-slate-500">
            Step {step} of {totalSteps}
          </span>
        </div>

        <div className="px-6 py-6">
          {step === 1 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-slate-100">Welcome to Zirtola</h2>
              <p className="mb-3 text-sm leading-relaxed text-slate-400">
                Zirtola is the AI Video Game Editor — a local-first companion for building games in
                Godot. It runs alongside Godot on a second monitor and gives you:
              </p>
              <ul className="mb-2 space-y-1.5 text-sm text-slate-300">
                <li>▶ A one-click launcher with F5/F6/F7 global hotkeys</li>
                <li>💬 An AI assistant that can see your game window</li>
                <li>📁 A project file browser</li>
                <li>🔌 A local MCP server for Claude Code</li>
              </ul>
              <p className="text-xs text-slate-500">
                Everything stays on your machine — no cloud uploads of any kind.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-slate-100">Project Folder</h2>
              <p className="mb-4 text-sm text-slate-400">
                Point Zirtola at your Godot project (the folder containing{' '}
                <code className="text-slate-300">project.godot</code>).
              </p>
              <div className="flex gap-2">
                <input readOnly value={projectDir} placeholder="No folder selected" className={inputClass} />
                <button
                  onClick={pickFolder}
                  className="shrink-0 rounded-md border border-panel-600 bg-panel-700 px-4 text-sm text-slate-200 hover:bg-panel-600"
                >
                  Browse
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              {exePath ? (
                <>
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-950/20 px-3 py-2.5 text-sm text-emerald-200">
                    <CheckIcon width={16} height={16} />
                    <span className="flex-1">
                      Godot connected
                      {versions && (
                        <>
                          {' · '}
                          {versions.versions.find(
                            (v) => v.id === detectVersionFromPath(versions, exePath),
                          )?.label ?? 'version set in Settings'}
                        </>
                      )}
                    </span>
                    <button
                      onClick={() => setExePath('')}
                      className="text-xs text-emerald-300/80 underline hover:text-emerald-200"
                    >
                      Change
                    </button>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">{exePath}</p>
                </>
              ) : (
                <GodotSetup onConnected={(path) => setExePath(path)} />
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-slate-100">API Keys</h2>
              <p className="mb-4 text-sm text-slate-400">
                Add at least one key to use the AI assistant. All keys are stored locally and
                encrypted. You can add or change these anytime in Settings.
              </p>
              {(
                [
                  ['Anthropic (Claude)', 'anthropic'],
                  ['OpenAI', 'openai'],
                  ['Gemini', 'gemini'],
                  ['DeepSeek', 'deepseek'],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="mb-3 block">
                  <span className="mb-1 block text-xs font-medium text-slate-400">{label} API Key</span>
                  <input
                    type="password"
                    value={keys[key]}
                    onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
                    placeholder={`${label}…`}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-600/20 text-emerald-400">
                <CheckIcon width={28} height={28} />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-slate-100">You're all set!</h2>
              <p className="text-sm text-slate-400">
                Zirtola is ready. Press <kbd className="rounded bg-panel-700 px-1.5 py-0.5 text-xs">F5</kbd>{' '}
                anytime to launch Godot.
              </p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-panel-600 px-6 py-4">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:bg-panel-700 disabled:opacity-30"
          >
            Back
          </button>
          <div className="flex gap-2">
            {canSkip && step < 5 && (
              <button
                onClick={skip}
                className="rounded-md border border-panel-600 px-4 py-1.5 text-sm text-slate-300 hover:bg-panel-700"
              >
                Skip
              </button>
            )}
            {step < totalSteps ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="rounded-md bg-accent px-5 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Next
              </button>
            ) : (
              <button
                onClick={finish}
                className="rounded-md bg-emerald-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
