import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/app'
import { TourProvider, useTour } from './state/tour'
import { ToastProvider, useToast } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { FileBrowser } from './components/FileBrowser'
import { NotesList } from './components/NotesList'
import { NoteEditor } from './components/NoteEditor'
import { EnginePanel } from './components/EnginePanel'
import { ChatPanel } from './components/ChatPanel'
import { GodotConsole } from './components/GodotConsole'
import { SettingsPanel } from './components/SettingsPanel'
import { ModelProfileEditor } from './components/ModelProfileEditor'
import { SetupWizard } from './components/SetupWizard'
import { Launcher } from './components/Launcher'

type LeftTab = 'files' | 'notes' | 'engine'
type MainView = 'chat' | 'note'
type View = 'launcher' | 'app'

function Root() {
  const { ready, config, refreshVersions } = useApp()
  const { toast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [wizardDone, setWizardDone] = useState(false)
  const [view, setView] = useState<View>('launcher')

  // Subtle toast + refresh when version definitions are merged from remote.
  useEffect(() => {
    const off = window.devpad.events.onVersionsUpdated((added) => {
      refreshVersions()
      toast(`Version definitions updated (${added.join(', ')})`, 'info')
    })
    return off
  }, [refreshVersions, toast])

  if (!ready || !config) {
    return (
      <div className="grid h-full place-items-center bg-panel-900 text-slate-500">
        Loading Zirtola…
      </div>
    )
  }

  // First-launch wizard captures the executable, first project and API keys.
  // On completion we drop straight into the app with the chosen project; the
  // launcher (Start New / Open Recent) is shown on subsequent opens.
  if (!config.setupComplete && !wizardDone) {
    return (
      <SetupWizard
        onDone={() => {
          setWizardDone(true)
          setView('app')
        }}
      />
    )
  }

  return (
    <>
      {view === 'launcher' ? (
        <Launcher onEnter={() => setView('app')} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <Shell
          onHome={() => setView('launcher')}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProfiles={() => setProfilesOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenProfiles={() => setProfilesOpen(true)}
        />
      )}
      {profilesOpen && <ModelProfileEditor onClose={() => setProfilesOpen(false)} />}
    </>
  )
}

function Shell({
  onHome,
  onOpenSettings,
  onOpenProfiles,
}: {
  onHome: () => void
  onOpenSettings: () => void
  onOpenProfiles: () => void
}) {
  const { config } = useApp()
  const tour = useTour()
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [mainView, setMainView] = useState<MainView>('chat')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  // Auto-start the guided tour the first time the user reaches the main app.
  useEffect(() => {
    if (config && !config.tourComplete) {
      const t = setTimeout(() => tour.start(), 400)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openNote = (id: string) => {
    setActiveNoteId(id)
    setMainView('note')
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar onHome={onHome} onOpenSettings={onOpenSettings} onOpenProfiles={onOpenProfiles} />
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: Files / Notes */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-panel-600" data-tour="left-tabs">
          <TabBar
            tabs={[
              { key: 'files', label: 'Files' },
              { key: 'notes', label: 'Notes' },
              { key: 'engine', label: 'Engine' },
            ]}
            active={leftTab}
            onChange={(k) => setLeftTab(k as LeftTab)}
          />
          <div className="min-h-0 flex-1">
            <div className={`h-full ${leftTab === 'files' ? '' : 'hidden'}`}>
              <FileBrowser />
            </div>
            <div className={`h-full ${leftTab === 'notes' ? '' : 'hidden'}`}>
              <NotesList selectedId={activeNoteId} onSelect={openNote} />
            </div>
            <div className={`h-full ${leftTab === 'engine' ? '' : 'hidden'}`}>
              <EnginePanel onShowChat={() => setMainView('chat')} />
            </div>
          </div>
        </aside>

        {/* Main panel: Chat / Note */}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar
            tabs={[
              { key: 'chat', label: 'Chat' },
              { key: 'note', label: 'Note' },
            ]}
            active={mainView}
            onChange={(k) => {
              setMainView(k as MainView)
              if (k === 'note') setLeftTab('notes')
            }}
          />
          <div className="min-h-0 flex-1">
            {/* ChatPanel stays mounted so conversation history is preserved. */}
            <div className={`h-full ${mainView === 'chat' ? '' : 'hidden'}`}>
              <ChatPanel onOpenSettings={onOpenSettings} />
            </div>
            <div className={`h-full ${mainView === 'note' ? '' : 'hidden'}`}>
              <NoteEditor noteId={activeNoteId} onSelect={setActiveNoteId} />
            </div>
          </div>
        </main>
      </div>

      {/* Bottom console: Godot output + problems with one-click fixes */}
      <GodotConsole onShowChat={() => setMainView('chat')} />
    </div>
  )
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex h-9 shrink-0 border-b border-panel-600 bg-panel-850">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 text-sm ${
            active === t.key
              ? 'border-b-2 border-accent text-slate-100'
              : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <TourProvider>
          <Root />
        </TourProvider>
      </AppProvider>
    </ToastProvider>
  )
}
