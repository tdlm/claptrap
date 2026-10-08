import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ProviderId } from '@shared/types'

/** What we need to turn a batch result back into a journal entry. Never includes the image. */
export interface CaptureMeta {
  id: string
  ts: number
  app?: string
  bundleId?: string
  windowTitle?: string
  url?: string
}

export interface PendingBatch {
  provider: ProviderId
  handle: string
  submittedAt: number
  items: CaptureMeta[]
}

// Persisted so results still land in the notes after a restart.
const file = () => path.join(app.getPath('userData'), 'batches.json')

export function loadPending(): PendingBatch[] {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as PendingBatch[]
  } catch {
    return []
  }
}

export function savePending(batches: PendingBatch[]): void {
  const tmp = `${file()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(batches, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file())
}
