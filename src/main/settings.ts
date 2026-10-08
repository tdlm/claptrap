import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BATCH_OPTIONS, type ProviderId, type Settings, type SettingsView } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = {
  provider: 'gateway',
  models: {
    // Gateway IDs use "provider/model" with dotted versions; the Settings window
    // lists live IDs from the Gateway if these ever drift.
    gateway: { capture: 'anthropic/claude-haiku-5.5', summary: 'anthropic/claude-sonnet-5.5' },
    anthropic: { capture: 'claude-haiku-5-5', summary: 'claude-sonnet-5-5' }
  },
  intervalSeconds: 30,
  batchEverySeconds: 300,
  idleThresholdSeconds: 120,
  notesDir: path.join(os.homedir(), 'Notes'),
  exclusions: [
    'com.1password.1password',
    'com.agilebits.onepassword7',
    'com.apple.Passwords',
    'com.apple.keychainaccess',
    'com.apple.MobileSMS'
  ],
  hourlySummaries: true,
  dailySummaryTime: '18:00',
  claptrapMode: true,
  showInDock: false,
  launchAtLogin: false
}

const userFile = (name: string) => path.join(app.getPath('userData'), name)

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(userFile(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  const file = userFile(name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

// ---- settings -------------------------------------------------------------

let settings: Settings | null = null
const listeners = new Set<(s: Settings, prev: Settings) => void>()

function merge(base: Settings, patch: Partial<Settings>): Settings {
  return {
    ...base,
    ...patch,
    models: {
      gateway: { ...base.models.gateway, ...patch.models?.gateway },
      anthropic: { ...base.models.anthropic, ...patch.models?.anthropic }
    }
  }
}

export function getSettings(): Settings {
  settings ??= merge(DEFAULT_SETTINGS, readJson<Partial<Settings>>('settings.json', {}))
  return settings
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const prev = getSettings()
  const next = merge(prev, patch)
  next.intervalSeconds = Math.max(10, Math.round(next.intervalSeconds))
  next.idleThresholdSeconds = Math.max(30, Math.round(next.idleThresholdSeconds))
  if (!BATCH_OPTIONS.includes(next.batchEverySeconds)) next.batchEverySeconds = DEFAULT_SETTINGS.batchEverySeconds
  settings = next
  writeJson('settings.json', next)
  for (const fn of listeners) fn(next, prev)
  return next
}

export function onSettingsChange(fn: (s: Settings, prev: Settings) => void): void {
  listeners.add(fn)
}

export function settingsView(): SettingsView {
  return { ...getSettings(), hasKey: { gateway: hasApiKey('gateway'), anthropic: hasApiKey('anthropic') } }
}

// ---- secrets (encrypted with the macOS Keychain via safeStorage) ----------

type Secrets = Partial<Record<ProviderId, string>>

export function getApiKey(provider: ProviderId): string | null {
  const blob = readJson<Secrets>('secrets.json', {})[provider]
  if (!blob) return null
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    return null
  }
}

export function hasApiKey(provider: ProviderId): boolean {
  return Boolean(readJson<Secrets>('secrets.json', {})[provider])
}

export function setApiKey(provider: ProviderId, key: string | null): void {
  const secrets = readJson<Secrets>('secrets.json', {})
  const trimmed = key?.trim()
  if (trimmed) secrets[provider] = safeStorage.encryptString(trimmed).toString('base64')
  else delete secrets[provider]
  writeJson('secrets.json', secrets)
  for (const fn of listeners) fn(getSettings(), getSettings())
}

// ---- small persisted runtime state ---------------------------------------

export interface RuntimeState {
  /** "YYYY-MM-DDTHH" of the last hour that got a recap. */
  lastHourly?: string
  /** "YYYY-MM-DD" of the last day that got an automatic summary. */
  lastDaily?: string
}

export const getRuntimeState = (): RuntimeState => readJson<RuntimeState>('state.json', {})
export const setRuntimeState = (patch: RuntimeState): void =>
  writeJson('state.json', { ...getRuntimeState(), ...patch })
