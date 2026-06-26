import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/app'
import { ToastProvider, useToast } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { FileBrowser } from './components/FileBrowser'
import { NotesList } from './components/NotesList'
import { NoteEditor } from './components/NoteEditor'
import { ChatPanel } from './components/ChatPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ModelProfileEditor } from './components/ModelProfileEditor'
import { SetupWizard } from './components/SetupWizard'

type LeftTab = 'files' | 'notes'
type MainView = 'chat' | 'note'

function Shell() {
  const { ready, config, refreshVersions } = useApp()
  const { toast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [wizardDone, setWizardDone] = useState(false)
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [mainView, setMainView] = useState<MainView>('chat')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

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
        Loading DevPad…
      </div>
    )
  }

  if (!config.setupComplete && !wizardDone) {
    return <SetupWizard onDone={() => setWizardDone(true)} />
  }

  const openNote = (id: string) => {
    setActiveNoteId(id)
    setMainView('note')
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenProfiles={() => setProfilesOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: Files / Notes */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-panel-600">
          <TabBar
            tabs={[
              { key: 'files', label: 'Files' },
              { key: 'notes', label: 'Notes' },
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
              <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
            </div>
            <div className={`h-full ${mainView === 'note' ? '' : 'hidden'}`}>
              <NoteEditor noteId={activeNoteId} onSelect={setActiveNoteId} />
            </div>
          </div>
        </main>
      </div>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenProfiles={() => setProfilesOpen(true)}
        />
      )}
      {profilesOpen && <ModelProfileEditor onClose={() => setProfilesOpen(false)} />}
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
        <Shell />
      </AppProvider>
    </ToastProvider>
  )
}
