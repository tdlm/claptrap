import { app } from 'electron'
import { engine } from './engine'
import { registerIpc } from './ipc'
import { getPermissions, recordLaunchPermissions } from './permissions'
import { getSettings, hasApiKey, onSettingsChange } from './settings'
import { createTray } from './tray'
import { openWindow } from './windows'

app.setName('Claptrap')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openWindow('settings'))

  // A menu bar app keeps running with no windows open.
  app.on('window-all-closed', () => {})

  void app.whenReady().then(() => {
    recordLaunchPermissions()
    const settings = getSettings()
    if (!settings.showInDock) app.dock?.hide()
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })

    onSettingsChange((next, prev) => {
      if (next.showInDock !== prev.showInDock) void (next.showInDock ? app.dock?.show() : app.dock?.hide())
      if (next.launchAtLogin !== prev.launchAtLogin && app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
      }
      engine.kick()
    })

    registerIpc()
    createTray()
    engine.start()

    const perms = getPermissions()
    if (perms.screen !== 'granted' || perms.needsRelaunch) openWindow('permissions')
    else if (!hasApiKey(settings.provider)) openWindow('settings')
  })

  // Send any queued screenshots before quitting; they only live in memory.
  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting || !engine.hasUnsent()) return engine.stop()
    e.preventDefault()
    quitting = true
    const timeout = new Promise((resolve) => setTimeout(resolve, 10_000))
    void Promise.race([engine.flush(), timeout]).finally(() => {
      engine.stop()
      app.quit()
    })
  })
}
