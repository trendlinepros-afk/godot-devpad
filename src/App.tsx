import { useEffect, useRef, useState } from 'react'
import { AppProvider, useApp } from './state/app'
import { TourProvider, useTour } from './state/tour'
import { ToastProvider, useToast } from './components/Toast'
import { LicenseGate } from './components/LicenseGate'
import { EulaScreen } from './components/EulaScreen'
import { EULA_VERSION } from './lib/eula'
import { Toolbar } from './components/Toolbar'
import { FileBrowser } from './components/FileBrowser'
import { NotesList } from './components/NotesList'
import { NoteEditor } from './components/NoteEditor'
import { EnginePanel } from './components/EnginePanel'
import { ChatPanel } from './components/ChatPanel'
import { EmbedPane } from './components/EmbedPane'
import { GodotConsole } from './components/GodotConsole'
import { SettingsPanel } from './components/SettingsPanel'
import { ModelProfileEditor } from './components/ModelProfileEditor'
import { SetupWizard } from './components/SetupWizard'
import { Launcher } from './components/Launcher'

type LeftTab = 'files' | 'notes' | 'engine'
type MainView = 'chat' | 'note' | 'game'
type View = 'launcher' | 'app'

function Root() {
  const { ready, config, refreshVersions, license } = useApp()
  const { toast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [wizardDone, setWizardDone] = useState(false)
  const [view, setView] = useState<View>('launcher')
  // Once the user has entered the app, keep the Shell MOUNTED (hidden) behind
  // the launcher: unmounting it would irreversibly wipe the chat conversation
  // and strand the embedded Godot window over the launcher.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (view === 'app') setEntered(true)
  }, [view])

  // License state lives in AppProvider (shared with toolbar/chat/settings).
  // Surface activation/trial confirmations as toasts here.
  useEffect(() => {
    if (license.state === 'licensed' && license.message) toast(license.message, 'success')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [license])

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

  // EULA first: nothing (not even license activation) until the current terms
  // are accepted. The installer shows the same text; this is in-app acceptance.
  if (config.eulaAcceptedVersion !== EULA_VERSION) {
    return <EulaScreen onAccepted={() => {}} />
  }

  // License gate: everything below (setup wizard included) requires a valid,
  // online-validated license. The main process enforces this on IPC too.
  // First-launch wizard captures the executable, first project and API keys.
  // On completion we drop straight into the app with the chosen project; the
  // launcher (Start New / Open Recent) is shown on subsequent opens.
  if (!config.setupComplete && !wizardDone) {
    return (
      <LicenseGate status={license}>
        <SetupWizard
          onDone={() => {
            setWizardDone(true)
            setView('app')
          }}
        />
      </LicenseGate>
    )
  }

  return (
    <LicenseGate status={license}>
      {view === 'launcher' && (
        <Launcher onEnter={() => setView('app')} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      {(view === 'app' || entered) && (
        <div className={view === 'app' ? 'contents' : 'hidden'}>
          <Shell
            visible={view === 'app'}
            onHome={() => setView('launcher')}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenProfiles={() => setProfilesOpen(true)}
          />
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenProfiles={() => setProfilesOpen(true)}
        />
      )}
      {profilesOpen && <ModelProfileEditor onClose={() => setProfilesOpen(false)} />}
    </LicenseGate>
  )
}

function Shell({
  visible,
  onHome,
  onOpenSettings,
  onOpenProfiles,
}: {
  visible: boolean
  onHome: () => void
  onOpenSettings: () => void
  onOpenProfiles: () => void
}) {
  const { config, godotStatus } = useApp()
  const { toast } = useToast()
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

  // In embedded mode, jump to the Game tab when the game starts so the embed
  // targets the visible pane (and the user sees its status) instead of getting
  // a separate window over Chat.
  const prevGodot = useRef(godotStatus.state)
  useEffect(() => {
    if (
      config?.godotWindowMode === 'embedded' &&
      godotStatus.state !== 'stopped' &&
      prevGodot.current === 'stopped'
    ) {
      setMainView('game')
    }
    prevGodot.current = godotStatus.state
  }, [godotStatus.state, config?.godotWindowMode])

  // Surface embed outcomes as toasts so the user gets feedback on any tab.
  useEffect(() => {
    return window.devpad.embed.onStatus((s) => {
      if (config?.godotWindowMode !== 'embedded') return
      if (s.active) toast('Godot embedded into the Game tab', 'success')
      else if (s.message) toast(s.message, 'info')
      else if (!s.supported && s.reason) toast(s.reason, 'info')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.godotWindowMode])

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
              { key: 'game', label: 'Game' },
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
            {/* Game pane stays mounted so it can report bounds for the embed. */}
            <div className={`h-full ${mainView === 'game' ? '' : 'hidden'}`}>
              {/* `visible` matters: when the user goes Home the Shell is hidden
                  (not unmounted), and the native window must park offscreen. */}
              <EmbedPane active={visible && mainView === 'game'} onOpenSettings={onOpenSettings} />
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
