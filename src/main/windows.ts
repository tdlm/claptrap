import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSettings } from './settings'

const here = path.dirname(fileURLToPath(import.meta.url))

type Route = 'settings' | 'permissions'

const SIZES: Record<Route, { width: number; height: number }> = {
  settings: { width: 820, height: 680 },
  permissions: { width: 580, height: 800 }
}

const windows = new Map<Route, BrowserWindow>()

export function openWindow(route: Route): BrowserWindow {
  const existing = windows.get(route)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    app.focus({ steal: true })
    return existing
  }

  const win = new BrowserWindow({
    ...SIZES[route],
    minWidth: 520,
    minHeight: 520,
    show: false,
    title: 'Claptrap',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#2b2622',
    resizable: route === 'settings',
    fullscreenable: false,
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })
  windows.set(route, win)

  win.once('ready-to-show', () => {
    win.show()
    app.focus({ steal: true })
  })
  win.on('closed', () => {
    windows.delete(route)
    if (windows.size === 0 && !getSettings().showInDock) app.dock?.hide()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Menu bar apps need a Dock presence while a window is open to take keyboard focus reliably.
  void app.dock?.show()

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}#/${route}`)
  else void win.loadFile(path.join(here, '../renderer/index.html'), { hash: `/${route}` })
  return win
}

export const allWindows = (): BrowserWindow[] => [...windows.values()].filter((w) => !w.isDestroyed())
