import { BrowserWindow, Notification, powerMonitor } from 'electron'
import { EventEmitter } from 'node:events'
import type { Analysis, JournalEntry, RunState, Status } from '@shared/types'
import { pick, voice } from '@shared/voice'
import { loadPending, savePending, type CaptureMeta, type PendingBatch } from './batches'
import { captureDisplay, difference, getFrontWindow, type FrontWindow } from './capture'
import { canCapture } from './permissions'
import {
  activeProvider,
  MissingKeyError,
  providerFor,
  type AiProvider,
  type BatchState,
  type CaptureRequest
} from './ai/provider'
import { captureContext, dailySystem, formatEntries, hhmm, HOURLY_SYSTEM } from './ai/prompts'
import { appendEntry, appendHourlyRecap, appendJournal, dayKey, hourKey, readJournal, writeDaySummary } from './notes'
import { getRuntimeState, getSettings, hasApiKey, setRuntimeState } from './settings'
import { spoolDelete, spoolHas, spoolList, spoolRead, spoolWrite } from './spool'

/** Below this mean pixel difference (0–1) a capture counts as "nothing changed". */
const CHANGE_THRESHOLD = 0.012
/** Unsent captures kept (spooled on disk, ~350 KB each); the oldest are dropped past this. */
const MAX_QUEUE = 240
const POLL_MS = 30_000
/**
 * A batch out this long is given up on: what's left is sent as regular (full-price)
 * requests instead. Recaps and day summaries also stop waiting on it.
 */
const FALLBACK_MS = 3 * 60 * 60_000
/** Regular requests per poll, so a big fallback doesn't stall polling for minutes. */
const FALLBACK_PER_POLL = 10
/** Sends tried per capture (batch or regular) before it's given up on. */
const MAX_ATTEMPTS = 3
/** Older batches (no spool) can't be resent; they're dropped after the batch APIs' limit. */
const LEGACY_DEADLINE_MS = 24 * 60 * 60_000
/** Spooled captures older than this are deleted at startup, whatever their state. */
const SPOOL_MAX_AGE_MS = 7 * 24 * 60 * 60_000

class Engine extends EventEmitter<{ status: [Status] }> {
  private status: Status = {
    state: 'idle',
    pausedUntil: null,
    pausedIndefinitely: false,
    lastEntry: null,
    lastCaptureAt: null,
    queued: 0,
    processing: 0,
    oldestBatchAt: null,
    batchError: null,
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

  // Captures waiting to be sent (metadata; the screenshots are in the spool).
  private queue: CaptureMeta[] = []
  // Batches sent and awaiting results; metadata only, persisted.
  private pending: PendingBatch[] = []

  start(): void {
    powerMonitor.on('lock-screen', () => (this.locked = true))
    powerMonitor.on('unlock-screen', () => (this.locked = false))
    powerMonitor.on('suspend', () => (this.locked = true))
    powerMonitor.on('resume', () => (this.locked = false))
    this.pending = loadPending()
    this.restoreQueue()
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
      processing: this.pending.reduce((n, b) => n + b.items.length, 0),
      oldestBatchAt: this.pending[0]?.submittedAt ?? null
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

      const meta: CaptureMeta = {
        id: `c${now.getTime()}`,
        ts: now.getTime(),
        app: front?.app,
        bundleId: front?.bundleId,
        windowTitle: front?.title,
        url: front?.url
      }
      try {
        spoolWrite({ meta, context, jpeg: capture.jpeg })
      } finally {
        capture.jpeg.fill(0)
      }
      this.queue.push(meta)
      this.trimQueue()
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
  //
  // Every capture is spooled (encrypted) the moment it's taken and stays spooled until its
  // entry is written, so nothing is lost to a failed send, a cancelled or expired batch, a
  // quit or a crash. A spool file existing means "not logged yet", which also keeps a late
  // duplicate result from being logged twice.

  /** On launch: spooled captures that aren't in a sent batch go back in the queue. */
  private restoreQueue(): void {
    const sent = new Set(this.pending.flatMap((b) => b.items.map((i) => i.id)))
    for (const meta of spoolList()) {
      if (Date.now() - meta.ts > SPOOL_MAX_AGE_MS) {
        console.warn(`[claptrap] capture ${meta.id} is over 7 days old; giving up on it`)
        spoolDelete(meta.id)
      } else if (!sent.has(meta.id)) {
        this.queue.push(meta)
      }
    }
    this.trimQueue()
  }

  private trimQueue(): void {
    while (this.queue.length > MAX_QUEUE) {
      const dropped = this.queue.shift()!
      console.warn(`[claptrap] queue full; dropping capture ${dropped.id}`)
      spoolDelete(dropped.id)
    }
  }

  /** Puts captures that got no usable result back in the queue, up to MAX_ATTEMPTS sends each. */
  private retry(items: CaptureMeta[], why: string): void {
    for (const meta of items) {
      if (!spoolHas(meta.id)) {
        // Already logged, or from an older batch whose screenshot wasn't kept.
        continue
      }
      const attempts = (meta.attempts ?? 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        console.error(`[claptrap] capture ${meta.id} failed ${attempts} times (${why}); giving up on it`)
        spoolDelete(meta.id)
        continue
      }
      console.warn(`[claptrap] capture ${meta.id} will be resent (${why})`)
      this.queue.push({ ...meta, attempts })
    }
    this.queue.sort((a, b) => a.ts - b.ts)
    this.trimQueue()
  }

  /** Writes a capture's entry, unless it's already been logged. */
  private commitCapture(meta: CaptureMeta, analysis: Analysis, legacy: boolean): void {
    if (!legacy && !spoolHas(meta.id)) return
    const { id, attempts: _attempts, ...rest } = meta
    this.commit({ ...analysis, ...rest })
    spoolDelete(id)
  }

  private flushing = false

  /** Sends everything queued as one batch. The screenshots stay spooled until logged. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    const items = this.queue.splice(0)
    const requests: CaptureRequest[] = []
    try {
      const sendable: CaptureMeta[] = []
      for (const meta of items) {
        const spooled = spoolRead(meta.id)
        if (!spooled) {
          console.warn(`[claptrap] capture ${meta.id} has no spooled screenshot; skipping it`)
          continue
        }
        sendable.push(meta)
        requests.push({ id: meta.id, jpeg: spooled.jpeg, context: spooled.context })
      }
      if (requests.length === 0) return
      const providerId = getSettings().provider
      const handle = await providerFor(providerId).submitCaptures(requests)
      this.pending.push({ provider: providerId, handle, submittedAt: Date.now(), items: sendable, spooled: true })
      savePending(this.pending)
    } catch (err) {
      // Put them back (oldest first) and try again at the next flush.
      this.queue.unshift(...items)
      this.trimQueue()
      if (err instanceof MissingKeyError) this.setState('needs-key', voice.needsKey)
      else {
        console.error('[claptrap] batch submit failed:', err)
        this.setState('error', [`${pick(voice.error)} (${(err as Error).message})`])
      }
    } finally {
      for (const r of requests) r.jpeg.fill(0)
      this.flushing = false
      this.updateCounts()
    }
  }

  private polling = false

  /**
   * Checks every in-flight batch and commits each one as soon as it finishes, so a slow
   * batch never holds up later ones (entries are inserted into the note in time order).
   * Captures without a usable result are resent; a batch out longer than FALLBACK_MS has
   * its remaining captures sent as regular requests.
   */
  private async poll(): Promise<void> {
    if (this.polling || this.pending.length === 0) return
    this.polling = true
    let batchError: string | null = null
    let changed = false
    try {
      for (const batch of [...this.pending]) {
        try {
          const outcome = await this.checkBatch(batch)
          if (outcome === 'waiting') continue
          changed = true
          if (outcome === 'finished') this.pending = this.pending.filter((b) => b !== batch)
        } catch (err) {
          if (err instanceof MissingKeyError) break
          batchError = (err as Error).message
          console.error(`[claptrap] batch ${batch.handle} check failed:`, err)
        }
      }
    } finally {
      if (changed) savePending(this.pending)
      this.polling = false
      this.status.batchError = batchError
      this.updateCounts()
    }
  }

  /**
   * 'finished': the batch is fully handled and can be forgotten; 'progress': some of its
   * captures were handled (its item list shrank); 'waiting': nothing changed.
   */
  private async checkBatch(batch: PendingBatch): Promise<'finished' | 'progress' | 'waiting'> {
    const provider = providerFor(batch.provider)
    const legacy = !batch.spooled
    const age = Date.now() - batch.submittedAt

    let state: BatchState | 'unreachable'
    try {
      state = await provider.batchState(batch.handle)
    } catch (err) {
      // Can't reach the batch; once it's overdue, the fallback below doesn't need it.
      if (legacy || age < FALLBACK_MS) throw err
      state = 'unreachable'
    }

    if (state === 'done') {
      const unresolved = new Map(batch.items.map((m) => [m.id, m]))
      const results: { meta: CaptureMeta; analysis: Analysis }[] = []
      for await (const r of provider.batchResults(batch.handle)) {
        const meta = unresolved.get(r.id)
        if (!meta) continue
        if (r.analysis) {
          unresolved.delete(r.id)
          results.push({ meta, analysis: r.analysis })
        } else {
          console.warn(`[claptrap] capture ${r.id}: no usable result (${r.error ?? 'unknown'})`)
        }
      }
      for (const { meta, analysis } of results.sort((a, b) => a.meta.ts - b.meta.ts)) {
        this.commitCapture(meta, analysis, legacy)
      }
      this.retry([...unresolved.values()], 'no usable result in its batch')
      return 'finished'
    }

    if (state === 'failed') {
      console.error(`[claptrap] batch ${batch.handle} failed`)
      this.retry(batch.items, 'batch failed')
      return 'finished'
    }

    if (legacy) {
      if (age < LEGACY_DEADLINE_MS) return 'waiting'
      console.error(`[claptrap] batch ${batch.handle} still pending after 24 h; dropping ${batch.items.length} captures`)
      provider.cancelBatch(batch.handle).catch((err) => console.warn('[claptrap] batch cancel failed:', err))
      return 'finished'
    }

    if (age < FALLBACK_MS) return 'waiting'
    return this.fallBack(provider, batch)
  }

  /** Sends a slow batch's remaining captures as regular requests, a few per poll. */
  private async fallBack(provider: AiProvider, batch: PendingBatch): Promise<'finished' | 'progress'> {
    const remaining = batch.items.filter((m) => spoolHas(m.id))
    const now = remaining.slice(0, FALLBACK_PER_POLL)
    if (now.length > 0) {
      console.warn(`[claptrap] batch ${batch.handle} is slow; sending ${now.length} of ${remaining.length} captures directly`)
    }
    const handled = new Set<string>()
    try {
      for (const meta of now) {
        const spooled = spoolRead(meta.id)
        if (!spooled) {
          handled.add(meta.id)
          continue
        }
        try {
          const r = await provider.analyzeCapture({ id: meta.id, jpeg: spooled.jpeg, context: spooled.context })
          if (r.analysis) this.commitCapture(meta, r.analysis, false)
          else this.retry([meta], r.error ?? 'no usable result')
          handled.add(meta.id)
        } finally {
          spooled.jpeg.fill(0)
        }
      }
    } finally {
      // Keep whatever wasn't handled (e.g. the network dropped mid-way) for the next poll.
      batch.items = remaining.filter((m) => !handled.has(m.id))
    }
    if (batch.items.length > 0) return 'progress'
    provider.cancelBatch(batch.handle).catch(() => {})
    return 'finished'
  }

  private commit(entry: JournalEntry): void {
    appendJournal(entry)
    const sameDay = this.lastEntry && dayKey(this.lastEntry.ts) === dayKey(entry.ts)
    if (!entry.same_as_previous || !sameDay) appendEntry(entry)
    // A late batch shouldn't move "last entry" backwards.
    if (this.lastEntry && entry.ts < this.lastEntry.ts) return
    this.lastEntry = entry
    this.setState(this.status.state, this.lines ?? voice.watching, {
      lastEntry: `${hhmm(entry.ts)} ${entry.activity}`
    })
  }

  private lastJournalEntry(): JournalEntry | null {
    const today = readJournal(dayKey())
    return today.at(-1) ?? null
  }

  /**
   * Earliest capture time still waiting on the model (queued or in a batch), or Infinity.
   * Batches out longer than FALLBACK_MS don't count, so one slow batch can't hold up
   * recaps and summaries for a day; its entries may then land after the recap.
   */
  private oldestOutstanding(): number {
    const waitFor = this.pending.filter((b) => Date.now() - b.submittedAt < FALLBACK_MS)
    const times = [...this.queue.map((q) => q.ts), ...waitFor.flatMap((b) => b.items.map((i) => i.ts))]
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
