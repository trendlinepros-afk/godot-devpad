import { useState } from 'react'
import { useApp } from '../state/app'
import { useToast } from './Toast'
import { UpdateControls } from './UpdateControls'
import { GodotSetup } from './GodotSetup'
import { Modal } from './ModelProfileEditor'
import { detectVersionFromPath } from '../lib/godot-versions'
import { FolderIcon, FolderOpenIcon, PlusIcon, GearIcon } from './Icons'

interface Props {
  onEnter: () => void
  onOpenSettings: () => void
}

// Most-recent-first, deduped, capped at 10.
function addRecent(list: string[], dir: string): string[] {
  return [dir, ...list.filter((d) => d !== dir)].slice(0, 10)
}

function folderName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p
}

export function Launcher({ onEnter, onOpenSettings }: Props) {
  const { config, versions, update } = useApp()
  const { toast } = useToast()
  const [showSetup, setShowSetup] = useState(false)
  if (!config) return null
  const recents = config.recentProjects ?? []
  const godotReady = !!config.godotExecutablePath

  const connectGodot = async (path: string) => {
    const detected = versions ? detectVersionFromPath(versions, path) : null
    await update({
      godotExecutablePath: path,
      ...(detected ? { activeVersionId: detected } : {}),
    })
    setShowSetup(false)
    toast('Godot is connected — you’re ready to build!', 'success')
  }

  const enterWith = async (dir: string) => {
    const v = await window.devpad.projects.validate(dir)
    if (!v.ok) {
      toast('Folder no longer exists — removed from recents.', 'error')
      await update({ recentProjects: recents.filter((d) => d !== dir) })
      return
    }
    await update({ projectDir: dir, recentProjects: addRecent(recents, dir) })
    onEnter()
  }

  const startNew = async () => {
    const dir = await window.devpad.dialog.pickFolder({
      title: 'Choose a folder for your new Godot project',
    })
    if (!dir) return
    const res = await window.devpad.projects.createNew(dir)
    if (!res.ok) {
      toast(res.error ?? 'Could not create the project.', 'error')
      return
    }
    await update({ projectDir: dir, recentProjects: addRecent(recents, dir) })
    toast(`New project created in ${folderName(dir)}`, 'success')
    onEnter()
  }

  const openExisting = async () => {
    const dir = await window.devpad.dialog.pickFolder({
      title: 'Open an existing Godot project',
    })
    if (dir) await enterWith(dir)
  }

  return (
    <div className="relative flex h-full flex-col bg-panel-900">
      {/* Top-right settings access */}
      <div className="absolute right-4 top-4">
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="grid h-8 w-8 place-items-center rounded-md border border-panel-600 bg-panel-800 text-slate-300 hover:bg-panel-700"
        >
          <GearIcon width={16} height={16} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-lg font-bold text-white">
              Z
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Zirtola</h1>
              <p className="text-sm text-slate-500">The AI Video Game Editor</p>
            </div>
          </div>

          {/* First-time Godot setup nudge */}
          {!godotReady && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-lg">
                🎮
              </span>
              <div className="flex-1">
                <div className="font-medium text-slate-100">First, let’s set up Godot</div>
                <div className="text-xs text-slate-400">
                  New to game dev? We’ll download and connect the game engine for you — no setup
                  knowledge needed.
                </div>
              </div>
              <button
                onClick={() => setShowSetup(true)}
                className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Set up Godot
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Start new */}
            <button
              onClick={startNew}
              className="group flex flex-col items-start gap-3 rounded-xl border border-panel-600 bg-panel-850 p-5 text-left transition hover:border-accent hover:bg-panel-800"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent/15 text-accent-hover">
                <PlusIcon width={22} height={22} />
              </span>
              <div>
                <div className="font-medium text-slate-100">Start New Project</div>
                <div className="text-xs text-slate-500">
                  Pick a folder — DevPad scaffolds a Godot project if needed.
                </div>
              </div>
            </button>

            {/* Open existing */}
            <button
              onClick={openExisting}
              className="group flex flex-col items-start gap-3 rounded-xl border border-panel-600 bg-panel-850 p-5 text-left transition hover:border-accent hover:bg-panel-800"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent/15 text-accent-hover">
                <FolderOpenIcon width={22} height={22} />
              </span>
              <div>
                <div className="font-medium text-slate-100">Open Project…</div>
                <div className="text-xs text-slate-500">Browse for an existing Godot project.</div>
              </div>
            </button>
          </div>

          {/* Recents */}
          <div className="mt-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Open Recent
            </h2>
            {recents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-panel-600 px-4 py-6 text-center text-sm text-slate-600">
                No recent projects yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-panel-600">
                {recents.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => enterWith(dir)}
                    className="flex w-full items-center gap-3 border-b border-panel-700 px-4 py-2.5 text-left last:border-b-0 hover:bg-panel-800"
                  >
                    <FolderIcon width={16} height={16} className="shrink-0 text-accent-hover" />
                    <span className="text-sm text-slate-200">{folderName(dir)}</span>
                    <span className="flex-1 truncate text-right text-xs text-slate-600">{dir}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lower-left: check for updates */}
      <div className="absolute bottom-4 left-4">
        <UpdateControls compact />
      </div>

      {showSetup && (
        <Modal title="Set up Godot" onClose={() => setShowSetup(false)}>
          <div className="max-h-[70vh] overflow-auto p-5">
            <GodotSetup onConnected={connectGodot} />
          </div>
        </Modal>
      )}
    </div>
  )
}
