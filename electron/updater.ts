import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

// App self-update via electron-updater, using the GitHub release provider
// configured in package.json (build.publish). On a packaged build this checks
// the repo's Releases for a newer installer, downloads it, and (with the user's
// confirmation) installs it on restart.
//
// electron-updater is CommonJS; pull autoUpdater off the default export so it
// works under the ESM main process.
const { autoUpdater } = electronUpdater

type Sender = (status: UpdateStatus) => void

let send: Sender = () => {}
let current: UpdateStatus = { state: 'idle', version: app.getVersion() }

function update(patch: Partial<UpdateStatus>): UpdateStatus {
  current = { ...current, ...patch }
  send(current)
  return current
}

export function getUpdateStatus(): UpdateStatus {
  return current
}

/** Wire up autoUpdater event forwarding. Call once after the window exists. */
export function initUpdater(sender: Sender): void {
  send = sender
  current = { state: 'idle', version: app.getVersion() }

  // We drive download/install explicitly so the user stays in control.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => update({ state: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    update({ state: 'available', newVersion: info.version, notes: stringifyNotes(info.releaseNotes) })
    // Honour "downloads it if available" — start the download right away.
    autoUpdater.downloadUpdate().catch((err) => {
      update({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    })
  })

  autoUpdater.on('update-not-available', () => update({ state: 'not-available' }))

  autoUpdater.on('download-progress', (p) => {
    update({ state: 'downloading', percent: Math.round(p.percent) })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    update({ state: 'downloaded', newVersion: info.version, percent: 100 })
    // Prompt to install now; works regardless of which screen is open.
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Zirtola ${info.version} has been downloaded.`,
      detail: 'Restart now to install the update, or it will be applied next time you quit.',
    })
    if (result.response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall())
    }
  })

  autoUpdater.on('error', (err) => {
    update({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  })
}

function stringifyNotes(notes: unknown): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (typeof n === 'string' ? n : (n?.note ?? '')))
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

/** Check GitHub for an update. No-ops gracefully when not packaged. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return update({
      state: 'unsupported',
      error: 'Updates are only available in an installed (packaged) build.',
    })
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    update({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return current
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return current
  if (current.state === 'downloading' || current.state === 'downloaded') return current
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    update({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return current
}

export function installUpdate(): void {
  if (current.state === 'downloaded') autoUpdater.quitAndInstall()
}
