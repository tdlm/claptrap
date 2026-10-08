import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { ProviderId, Settings } from '@shared/types'
import { engine } from './engine'
import { listRunningApps } from './capture'
import { providerFor } from './ai/provider'
import {
  getPermissions,
  openPermissionPane,
  requestAccessibility,
  requestScreenRecording
} from './permissions'
import { getSettings, setApiKey, settingsView, updateSettings } from './settings'
import { allWindows, openWindow } from './windows'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => settingsView())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    updateSettings(patch)
    return settingsView()
  })
  ipcMain.handle('settings:setApiKey', (_e, provider: ProviderId, key: string | null) => {
    setApiKey(provider, key)
    return settingsView()
  })
  ipcMain.handle('settings:chooseNotesDir', async (e) => {
    const opts: Electron.OpenDialogOptions = {
      defaultPath: getSettings().notesDir,
      properties: ['openDirectory', 'createDirectory']
    }
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('apps:running', () => listRunningApps())

  ipcMain.handle('models:list', async (_e, provider: ProviderId) => {
    try {
      const models = await providerFor(provider).listModels()
      return { ok: true, models }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })
  ipcMain.handle('models:test', async (_e, provider: ProviderId) => {
    try {
      const reply = await providerFor(provider).summarize(
        'Reply with one short, excited sentence, in the voice of a small boastful robot, confirming you are online. Original wording only.',
        'Status check.',
        'summary'
      )
      return { ok: true, message: reply }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('permissions:get', () => getPermissions())
  ipcMain.handle('permissions:open', (_e, kind: 'screen' | 'accessibility') => openPermissionPane(kind))
  ipcMain.handle('permissions:requestAccessibility', () => requestAccessibility())
  ipcMain.handle('permissions:requestScreen', () => requestScreenRecording())
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('status:get', () => engine.getStatus())
  engine.on('status', (status) => {
    for (const win of allWindows()) win.webContents.send('status', status)
  })

  ipcMain.handle('window:open', (_e, route: 'settings' | 'permissions') => {
    openWindow(route)
  })
  ipcMain.handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}
