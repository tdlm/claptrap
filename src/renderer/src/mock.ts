// Fake bridge for previewing the UI in a plain browser (no Electron preload).
import type { ClaptrapApi, PermissionState, SettingsView, Status } from '@shared/types'

export function installMockApi(): void {
  if (window.claptrap) return
  let settings: SettingsView = {
    provider: 'gateway',
    models: {
      gateway: { capture: 'anthropic/claude-haiku-5.5', summary: 'anthropic/claude-sonnet-5.5' },
      anthropic: { capture: 'claude-haiku-5-5', summary: 'claude-sonnet-5-5' }
    },
    intervalSeconds: 30,
    batchEverySeconds: 300,
    idleThresholdSeconds: 120,
    notesDir: '~/Notes',
    exclusions: ['com.1password.1password', 'com.apple.MobileSMS'],
    hourlySummaries: true,
    dailySummaryTime: '18:00',
    claptrapMode: true,
    showInDock: false,
    launchAtLogin: false,
    hasKey: { gateway: false, anthropic: false }
  }
  let perms: PermissionState = { screen: 'denied', accessibility: false, needsRelaunch: false, isDev: true }
  const status: Status = {
    state: 'watching',
    pausedUntil: null,
    pausedIndefinitely: false,
    lastEntry: '10:42 Editing Settings.tsx in VS Code',
    lastCaptureAt: Date.now(),
    queued: 4,
    processing: 10,
    message: 'Observing! Documenting! Being incredibly helpful!'
  }
  const ok = async <T>(v: T) => v
  const api: ClaptrapApi = {
    getSettings: () => ok(settings),
    updateSettings: async (p) => (settings = { ...settings, ...p }),
    setApiKey: async (prov, key) => (settings = { ...settings, hasKey: { ...settings.hasKey, [prov]: !!key } }),
    listModels: () => ok({ ok: true as const, models: ['anthropic/claude-haiku-5.5', 'anthropic/claude-sonnet-5.5'] }),
    testProvider: () => ok({ ok: true as const, message: 'BRAIN ONLINE! I am the smartest robot in the room!' }),
    chooseNotesDir: () => ok(null),
    listRunningApps: () => ok([{ name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' }]),
    getPermissions: () => ok(perms),
    openPermissionPane: async () => {},
    requestAccessibility: async () => void (perms = { ...perms, accessibility: true }),
    requestScreenRecording: async () => void (perms = { ...perms, screen: 'granted', needsRelaunch: true }),
    relaunch: async () => void (perms = { ...perms, needsRelaunch: false }),
    getStatus: () => ok(status),
    onStatus: () => () => {},
    openWindow: async (route) => void (location.hash = `/${route}`),
    closeWindow: async () => {}
  }
  window.claptrap = api
}
