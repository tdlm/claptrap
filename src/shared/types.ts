export type ProviderId = 'gateway' | 'anthropic'

export interface ModelChoice {
  /** Cheap, fast vision model: every capture, plus the hourly recaps. */
  capture: string
  /** Stronger model for the end-of-day summary. */
  summary: string
}

export const BATCH_OPTIONS = [30, 300, 1800, 3600] as const
export type BatchEvery = (typeof BATCH_OPTIONS)[number]

export interface Settings {
  provider: ProviderId
  models: Record<ProviderId, ModelChoice>
  intervalSeconds: number
  /** How often queued screenshots are sent as one batch request (batch pricing is 50% off). */
  batchEverySeconds: BatchEvery
  idleThresholdSeconds: number
  notesDir: string
  /** Bundle IDs or app names (case-insensitive) that are never captured. */
  exclusions: string[]
  hourlySummaries: boolean
  /** Local "HH:MM" after which the end-of-day summary is written. */
  dailySummaryTime: string
  /** Adds a "Claptrap says" commentary section to the day summary. */
  claptrapMode: boolean
  showInDock: boolean
  launchAtLogin: boolean
}

export interface SettingsView extends Settings {
  hasKey: Record<ProviderId, boolean>
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface PermissionState {
  screen: ScreenAccess
  accessibility: boolean
  /** Screen Recording was granted after launch; macOS only applies it after a relaunch. */
  needsRelaunch: boolean
  /** Running via `npm run dev`: macOS attributes permissions to the launching app, not Claptrap. */
  isDev: boolean
}

export type RunState = 'watching' | 'paused' | 'idle' | 'blind' | 'needs-key' | 'error'

export interface Status {
  state: RunState
  /** Epoch ms when a timed pause ends; null when not paused or paused indefinitely. */
  pausedUntil: number | null
  pausedIndefinitely: boolean
  lastEntry: string | null
  lastCaptureAt: number | null
  /** Screenshots captured but not yet sent. */
  queued: number
  /** Screenshots sent in batches whose results haven't come back yet. */
  processing: number
  message: string
}

export const CATEGORIES = [
  'coding',
  'writing',
  'communication',
  'meeting',
  'browsing',
  'research',
  'design',
  'planning',
  'admin',
  'media',
  'other'
] as const
export type Category = (typeof CATEGORIES)[number]

export interface Analysis {
  activity: string
  app: string
  details: string
  category: Category
  same_as_previous: boolean
}

export interface JournalEntry extends Analysis {
  ts: number
  bundleId?: string
  windowTitle?: string
  url?: string
}

export type ModelListResult = { ok: true; models: string[] } | { ok: false; error: string }
export type TestResult = { ok: true; message: string } | { ok: false; error: string }

export interface ClaptrapApi {
  getSettings(): Promise<SettingsView>
  updateSettings(patch: Partial<Settings>): Promise<SettingsView>
  setApiKey(provider: ProviderId, key: string | null): Promise<SettingsView>
  listModels(provider: ProviderId): Promise<ModelListResult>
  testProvider(provider: ProviderId): Promise<TestResult>
  chooseNotesDir(): Promise<string | null>
  listRunningApps(): Promise<{ name: string; bundleId?: string }[]>

  getPermissions(): Promise<PermissionState>
  openPermissionPane(kind: 'screen' | 'accessibility'): Promise<void>
  requestAccessibility(): Promise<void>
  requestScreenRecording(): Promise<void>
  relaunch(): Promise<void>

  getStatus(): Promise<Status>
  onStatus(cb: (status: Status) => void): () => void
  openWindow(route: 'settings' | 'permissions'): Promise<void>
  closeWindow(): Promise<void>
}
