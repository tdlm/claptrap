import { app, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { RunState, Status } from '@shared/types'
import { engine } from './engine'
import { dayKey, notePath } from './notes'
import { getSettings } from './settings'
import { openWindow } from './windows'

const resourcesDir = () =>
  app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(app.getAppPath(), 'resources')

const ICON_FOR: Record<RunState, string> = {
  watching: 'trayWatchingTemplate.png',
  idle: 'trayWatchingTemplate.png',
  paused: 'trayPausedTemplate.png',
  blind: 'trayAlertTemplate.png',
  'needs-key': 'trayAlertTemplate.png',
  error: 'trayAlertTemplate.png'
}

const HEADLINE: Record<RunState, string> = {
  watching: 'Watching',
  idle: 'Standing by',
  paused: 'Napping',
  blind: "Can't see — permissions needed",
  'needs-key': 'Brain unplugged — add an API key',
  error: 'Malfunctioning (a little)'
}

let tray: Tray | null = null

function icon(state: RunState) {
  const img = nativeImage.createFromPath(path.join(resourcesDir(), ICON_FOR[state]))
  img.setTemplateImage(true)
  return img
}

function remaining(status: Status): string {
  if (status.pausedIndefinitely) return '∞'
  if (!status.pausedUntil) return ''
  const mins = Math.max(1, Math.ceil((status.pausedUntil - Date.now()) / 60_000))
  return mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins}m`
}

function untilTomorrow(): number {
  const t = new Date()
  t.setDate(t.getDate() + 1)
  t.setHours(8, 0, 0, 0)
  return t.getTime() - Date.now()
}

const truncate = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function buildMenu(status: Status): Menu {
  const paused = status.state === 'paused'
  const pauseItems: MenuItemConstructorOptions[] = [
    { label: 'Nap for 15 minutes', click: () => engine.pause(15 * 60_000) },
    { label: 'Nap for 1 hour', click: () => engine.pause(60 * 60_000) },
    { label: 'Nap for 2 hours', click: () => engine.pause(2 * 60 * 60_000) },
    { label: 'Hibernate until tomorrow (8 AM)', click: () => engine.pause(untilTomorrow()) },
    { type: 'separator' },
    { label: 'Nap until I wake you', click: () => engine.pause(null) }
  ]

  const template: MenuItemConstructorOptions[] = [
    { label: `CLAPTRAP · ${HEADLINE[status.state]}${paused ? ` (${remaining(status)})` : ''}`, enabled: false },
    { label: truncate(status.message), enabled: false },
    ...(status.lastEntry ? [{ label: `Last: ${truncate(status.lastEntry)}`, enabled: false }] : []),
    ...(status.queued || status.processing
      ? [{ label: `Queued ${status.queued} · Thinking about ${status.processing}`, enabled: false }]
      : []),
    { type: 'separator' },
    paused
      ? { label: 'Wake up!', click: () => engine.resume() }
      : { label: 'Pause', submenu: pauseItems },
    { label: 'Capture & send now', enabled: !paused, click: () => void engine.captureNow() },
    { type: 'separator' },
    {
      label: "Open today's notes",
      click: () => {
        const file = notePath(dayKey())
        void (fs.existsSync(file) ? shell.openPath(file) : shell.openPath(getSettings().notesDir))
      }
    },
    { label: 'Open notes folder', click: () => void shell.openPath(getSettings().notesDir) },
    { label: 'Summarize today now', click: () => void engine.summarizeDay().catch((e) => console.error(e)) },
    { type: 'separator' },
    { label: 'Permissions…', click: () => openWindow('permissions') },
    { label: 'Settings…', accelerator: 'Command+,', click: () => openWindow('settings') },
    { type: 'separator' },
    { label: 'Quit Claptrap', accelerator: 'Command+Q', click: () => app.quit() }
  ]
  return Menu.buildFromTemplate(template)
}

function render(status: Status): void {
  if (!tray) return
  tray.setImage(icon(status.state))
  tray.setTitle(status.state === 'paused' ? remaining(status) : '', { fontType: 'monospacedDigit' })
  tray.setToolTip(`Claptrap — ${HEADLINE[status.state]}`)
  tray.setContextMenu(buildMenu(status))
}

export function createTray(): void {
  tray = new Tray(icon(engine.getStatus().state))
  render(engine.getStatus())
  engine.on('status', render)
  // Keep the pause countdown fresh.
  setInterval(() => {
    const status = engine.getStatus()
    if (status.state === 'paused') {
      engine.isPaused()
      render(engine.getStatus())
    }
  }, 30_000)
}
