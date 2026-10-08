import { BrowserWindow, Notification, powerMonitor } from 'electron'
import { EventEmitter } from 'node:events'
import type { JournalEntry, RunState, Status } from '@shared/types'
import { pick, voice } from '@shared/voice'
import { loadPending, savePending, type CaptureMeta, type PendingBatch } from './batches'
import { captureDisplay, difference, getFrontWindow, type FrontWindow } from './capture'
import { canCapture } from './permissions'
import { activeProvider, MissingKeyError, providerFor } from './ai/provider'
import { captureContext, dailySystem, formatEntries, hhmm, HOURLY_SYSTEM } from './ai/prompts'
import { appendEntry, appendHourlyRecap, appendJournal, dayKey, hourKey, readJournal, writeDaySummary } from './notes'
import { getRuntimeState, getSettings, hasApiKey, setRuntimeState } from './settings'

/** Below this mean pixel difference (0–1) a capture counts as "nothing changed". */
const CHANGE_THRESHOLD = 0.012
/** Screenshots held in memory while waiting to be sent (~250 KB each). */
const MAX_QUEUE = 240
const POLL_MS = 30_000

interface Queued extends CaptureMeta {
  jpeg: Buffer
  context: string
}

class Engine extends EventEmitter<{ status: [Status] }> {
  private status: Status = {
    state: 'idle',
    pausedUntil: null,
    pausedIndefinitely: false,
    lastEntry: null,
    lastCaptureAt: null,
    queued: 0,
    processing: 0,
    message: pick(voice.idle)
  }
  private lines: readonly string[] | null = null
  private timers: NodeJS.Timeout[] = []
  private loopTimer: NodeJS.Timeout | null = null
  private flushTimer: NodeJS.Timeout | null = null
  private busy = false
  private locked = false
  private lastFingerprint: Uint8Array | null = null
  private lastFront: { time: Date; app?: string; windowTitle?: string } | null = null
  private lastEntry: JournalEntry | null = null
  private consecutiveErrors = 0

  // Screenshots waiting to be sent; they exist only in memory.
  private queue: Queued[] = []
  // Batches sent and awaiting results; metadata only, persisted.
  private pending: PendingBatch[] = []

  start(): void {
    powerMonitor.on('lock-screen', () => (this.locked = true))
    powerMonitor.on('unlock-screen', () => (this.locked = false))
    powerMonitor.on('suspend', () => (this.locked = true))
    powerMonitor.on('resume', () => (this.locked = false))
    this.pending = loadPending()
    this.lastEntry = this.lastJournalEntry()
    this.schedule(3_000)
    this.scheduleFlush()
    this.timers.push(setInterval(() => void this.poll(), POLL_MS))
    this.timers.push(setInterval(() => void this.summaryTick(), 60_000))
    this.updateCounts()
    void this.poll()
  }

  stop(): void {
    for (const t of [this.loopTimer, this.flushTimer, ...this.timers]) if (t) clearTimeout(t)
  }

  getStatus = (): Status => this.status

  /** Re-runs the loop now, e.g. after settings or permissions change. */
  kick(): void {
    this.schedule(500)
    this.scheduleFlush()
  }

  pause(ms: number | null): void {
    this.status.pausedUntil = ms === null ? null : Date.now() + ms
    this.status.pausedIndefinitely = ms === null
    this.lastFingerprint = null
    this.setState('paused', voice.paused)
  }

  resume(): void {
    this.status.pausedUntil = null
    this.status.pausedIndefinitely = false
    this.setState('watching', voice.watching)
    this.schedule(500)
  }

  isPaused(): boolean {
    const { pausedIndefinitely, pausedUntil } = this.status
    if (pausedIndefinitely) return true
    if (pausedUntil && Date.now() < pausedUntil) return true
    if (pausedUntil) this.resume()
    return false
  }

  /** Capture immediately and send everything queued without waiting for the batch timer. */
  async captureNow(): Promise<void> {
    await this.tick(true)
    await this.flush()
  }

  hasUnsent = (): boolean => this.queue.length > 0

  private schedule(delayMs?: number): void {
    if (this.loopTimer) clearTimeout(this.loopTimer)
    const backoff = Math.min(this.consecutiveErrors, 5)
    const delay = delayMs ?? getSettings().intervalSeconds * 1000 * 2 ** backoff
    this.loopTimer = setTimeout(async () => {
      await this.tick(false)
      this.schedule()
    }, delay)
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = setInterval(() => void this.flush(), getSettings().batchEverySeconds * 1000)
  }

  /** Picks a fresh voice line only when the mood (line pool) changes or there's a new entry. */
  private setState(state: RunState, lines: readonly string[], extra: Partial<Status> = {}): void {
    const sameMood = this.status.state === state && this.lines === lines && !extra.lastEntry
    this.lines = lines
    this.status = { ...this.status, ...extra, state, message: sameMood ? this.status.message : pick(lines) }
    this.emit('status', this.status)
  }

  private updateCounts(): void {
    this.status = {
      ...this.status,
      queued: this.queue.length,
      processing: this.pending.reduce((n, b) => n + b.items.length, 0)
    }
    this.emit('status', this.status)
  }

  private excluded(front: FrontWindow | null): boolean {
    if (!front) return false
    const ids = getSettings().exclusions.map((x) => x.toLowerCase())
    return ids.includes(front.app.toLowerCase()) || (!!front.bundleId && ids.includes(front.bundleId.toLowerCase()))
  }

  // ---- capture ---------------------------------------------------------------

  private async tick(force: boolean): Promise<void> {
    if (this.busy) return
    if (this.isPaused()) return this.setState('paused', voice.paused)
    if (!canCapture()) return this.setState('blind', voice.blind)
    if (!hasApiKey(getSettings().provider)) return this.setState('needs-key', voice.needsKey)
    if (this.locked) return this.setState('idle', voice.idle)
    if (!force && powerMonitor.getSystemIdleTime() >= getSettings().idleThresholdSeconds) {
      return this.setState('idle', voice.idle)
    }
    // Claptrap's own windows aren't worth logging (and may show settings).
    if (BrowserWindow.getFocusedWindow()) return

    this.busy = true
    try {
      const front = await getFrontWindow()
      if (this.excluded(front)) {
        this.lastFingerprint = null
        return this.setState('watching', voice.excluded)
      }

      const capture = await captureDisplay(front)
      const unchanged =
        this.lastFingerprint !== null &&
        difference(this.lastFingerprint, capture.fingerprint) < CHANGE_THRESHOLD &&
        front?.title === this.lastFront?.windowTitle
      if (unchanged && !force) {
        capture.jpeg.fill(0)
        return this.setState('watching', voice.watching)
      }

      const now = new Date()
      const context = captureContext({
        time: now,
        app: front?.app,
        bundleId: front?.bundleId,
        windowTitle: front?.title,
        url: front?.url,
        previous: this.lastEntry,
        previousCapture: this.lastFront
      })
      this.lastFingerprint = capture.fingerprint
      this.lastFront = { time: now, app: front?.app, windowTitle: front?.title }

      this.queue.push({
        id: `c${now.getTime()}`,
        ts: now.getTime(),
        app: front?.app,
        bundleId: front?.bundleId,
        windowTitle: front?.title,
        url: front?.url,
        jpeg: capture.jpeg,
        context
      })
      while (this.queue.length > MAX_QUEUE) this.queue.shift()?.jpeg.fill(0)
      this.consecutiveErrors = 0
      this.updateCounts()
      this.setState('watching', voice.watching, { lastCaptureAt: now.getTime() })
    } catch (err) {
      this.consecutiveErrors++
      console.error('[claptrap] capture failed:', err)
      this.setState('error', [`${pick(voice.error)} (${(err as Error).message})`])
    } finally {
      this.busy = false
    }
  }

  // ---- batches -----------------------------------------------------------------

  private flushing = false

  /** Sends everything queued as one batch. Screenshots are scrubbed from memory once sent. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    const items = this.queue.splice(0)
    try {
      const providerId = getSettings().provider
      const handle = await providerFor(providerId).submitCaptures(items)
      this.pending.push({
        provider: providerId,
        handle,
        submittedAt: Date.now(),
        items: items.map(({ jpeg: _jpeg, context: _context, ...meta }) => meta)
      })
      savePending(this.pending)
      for (const item of items) item.jpeg.fill(0)
    } catch (err) {
      // Put them back (oldest first) and try again at the next flush.
      this.queue.unshift(...items)
      while (this.queue.length > MAX_QUEUE) this.queue.shift()?.jpeg.fill(0)
      if (err instanceof MissingKeyError) this.setState('needs-key', voice.needsKey)
      else {
        console.error('[claptrap] batch submit failed:', err)
        this.setState('error', [`${pick(voice.error)} (${(err as Error).message})`])
      }
    } finally {
      this.flushing = false
      this.updateCounts()
    }
  }

  private polling = false

  /** Commits finished batches in submission order so the log stays chronological. */
  private async poll(): Promise<void> {
    if (this.polling || this.pending.length === 0) return
    this.polling = true
    try {
      while (this.pending.length > 0) {
        const batch = this.pending[0]
        const provider = providerFor(batch.provider)
        const state = await provider.batchState(batch.handle)
        if (state === 'pending') break

        const results = new Map<string, JournalEntry>()
        if (state === 'done') {
          for await (const r of provider.batchResults(batch.handle)) {
            const meta = batch.items.find((m) => m.id === r.id)
            if (!meta || !r.analysis) {
              if (r.error) console.warn(`[claptrap] capture ${r.id} skipped: ${r.error}`)
              continue
            }
            const { id: _id, ...rest } = meta
            results.set(r.id, { ...r.analysis, ...rest })
          }
        } else {
          console.error(`[claptrap] batch ${batch.handle} failed; dropping ${batch.items.length} captures`)
        }
        for (const entry of [...results.values()].sort((a, b) => a.ts - b.ts)) this.commit(entry)

        this.pending.shift()
        savePending(this.pending)
        this.updateCounts()
      }
    } catch (err) {
      if (!(err instanceof MissingKeyError)) console.error('[claptrap] batch poll failed:', err)
    } finally {
      this.polling = false
    }
  }

  private commit(entry: JournalEntry): void {
    appendJournal(entry)
    const sameDay = this.lastEntry && dayKey(this.lastEntry.ts) === dayKey(entry.ts)
    if (!entry.same_as_previous || !sameDay) appendEntry(entry)
    this.lastEntry = entry
    this.setState(this.status.state, this.lines ?? voice.watching, {
      lastEntry: `${hhmm(entry.ts)} ${entry.activity}`
    })
  }

  private lastJournalEntry(): JournalEntry | null {
    const today = readJournal(dayKey())
    return today.at(-1) ?? null
  }

  /** Earliest capture time still waiting on the model (queued or in a batch), or Infinity. */
  private oldestOutstanding(): number {
    const times = [...this.queue.map((q) => q.ts), ...this.pending.flatMap((b) => b.items.map((i) => i.ts))]
    return times.length ? Math.min(...times) : Infinity
  }

  // ---- summaries -----------------------------------------------------------------

  private summarizing = false

  private async summaryTick(): Promise<void> {
    if (this.summarizing) return
    this.summarizing = true
    try {
      await this.hourlyRecap()
      await this.dailySummaries()
    } catch (err) {
      console.error('[claptrap] summary failed:', err)
    } finally {
      this.summarizing = false
    }
  }

  private async hourlyRecap(): Promise<void> {
    const settings = getSettings()
    const prevHour = new Date(Date.now() - 3_600_000)
    const key = hourKey(prevHour)
    if (!settings.hourlySummaries || getRuntimeState().lastHourly === key) return

    // Wait until every capture from that hour has come back from its batch.
    const hourEnd = new Date(prevHour)
    hourEnd.setMinutes(60, 0, 0)
    if (this.oldestOutstanding() < hourEnd.getTime()) return

    const day = dayKey(prevHour)
    const entries = readJournal(day).filter((e) => hourKey(e.ts) === key)
    if (entries.length >= 2) {
      const text = await activeProvider().summarize(HOURLY_SYSTEM, formatEntries(entries), 'capture')
      const h = prevHour.getHours()
      appendHourlyRecap(day, `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`, text)
    }
    setRuntimeState({ lastHourly: key })
  }

  private async dailySummaries(): Promise<void> {
    const { dailySummaryTime } = getSettings()
    const last = getRuntimeState().lastDaily ?? ''
    const today = dayKey()
    const yesterday = dayKey(Date.now() - 86_400_000)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    // Catch up on yesterday if the Mac was asleep at summary time.
    if (last < yesterday && readJournal(yesterday).length > 0 && this.oldestOutstanding() >= startOfToday.getTime()) {
      await this.summarizeDay(yesterday)
      setRuntimeState({ lastDaily: yesterday })
    }
    const [h, m] = dailySummaryTime.split(':').map(Number)
    const due = new Date()
    due.setHours(h || 18, m || 0, 0, 0)
    if (
      last < today &&
      Date.now() >= due.getTime() &&
      this.oldestOutstanding() >= due.getTime() &&
      readJournal(today).length > 0
    ) {
      await this.summarizeDay(today)
      setRuntimeState({ lastDaily: today })
    }
  }

  /** Writes the day summary for `day` (default today). Returns false if there was nothing to summarize. */
  async summarizeDay(day = dayKey()): Promise<boolean> {
    const entries = readJournal(day)
    if (entries.length === 0) return false
    const { intervalSeconds, claptrapMode } = getSettings()
    const markdown = await activeProvider().summarize(
      dailySystem(intervalSeconds, claptrapMode),
      formatEntries(entries),
      'summary'
    )
    writeDaySummary(day, markdown)
    new Notification({ title: 'Claptrap', body: pick(voice.daySummary), silent: true }).show()
    return true
  }
}

export const engine = new Engine()
