import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/app'
import { ToastProvider, useToast } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { FileBrowser } from './components/FileBrowser'
import { ChatPanel } from './components/ChatPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ModelProfileEditor } from './components/ModelProfileEditor'
import { SetupWizard } from './components/SetupWizard'

function Shell() {
  const { ready, config, refreshVersions } = useApp()
  const { toast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [wizardDone, setWizardDone] = useState(false)

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

  // First launch wizard.
  if (!config.setupComplete && !wizardDone) {
    return <SetupWizard onDone={() => setWizardDone(true)} />
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenProfiles={() => setProfilesOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-panel-600">
          <FileBrowser />
        </aside>
        <main className="min-w-0 flex-1">
          <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
        </main>
      </div>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenProfiles={() => {
            setProfilesOpen(true)
          }}
        />
      )}
      {profilesOpen && <ModelProfileEditor onClose={() => setProfilesOpen(false)} />}
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
