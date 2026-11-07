import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { CaptureMeta } from './batches'

/**
 * Captures waiting for their journal entry, kept on disk so a lost, failed or slow send can
 * be retried, even after a restart. Encrypted with the Keychain-backed safeStorage key
 * (like the API keys) and deleted as soon as the entry is written or the capture is
 * given up on. A capture's spool file existing means "not logged yet".
 */
export interface Spooled {
  meta: CaptureMeta
  context: string
  jpeg: Buffer
}

const dir = () => path.join(app.getPath('userData'), 'spool')
const file = (id: string) => path.join(dir(), `${id}.bin`)

export function spoolWrite({ meta, context, jpeg }: Spooled): void {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 })
  const json = JSON.stringify({ meta, context, jpeg: jpeg.toString('base64') })
  const tmp = `${file(meta.id)}.tmp`
  fs.writeFileSync(tmp, safeStorage.encryptString(json), { mode: 0o600 })
  fs.renameSync(tmp, file(meta.id))
}

export function spoolRead(id: string): Spooled | null {
  try {
    const { meta, context, jpeg } = JSON.parse(safeStorage.decryptString(fs.readFileSync(file(id)))) as {
      meta: CaptureMeta
      context: string
      jpeg: string
    }
    return { meta, context, jpeg: Buffer.from(jpeg, 'base64') }
  } catch {
    return null
  }
}

export const spoolHas = (id: string): boolean => fs.existsSync(file(id))

export function spoolDelete(id: string): void {
  fs.rmSync(file(id), { force: true })
}

/** Metadata of every spooled capture, oldest first. Unreadable files are removed. */
export function spoolList(): CaptureMeta[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir())
  } catch {
    return []
  }
  const metas: CaptureMeta[] = []
  for (const name of names) {
    if (name.endsWith('.tmp')) {
      fs.rmSync(path.join(dir(), name), { force: true })
      continue
    }
    if (!name.endsWith('.bin')) continue
    const s = spoolRead(name.slice(0, -4))
    if (s) {
      s.jpeg.fill(0)
      metas.push(s.meta)
    } else {
      console.warn(`[claptrap] removing unreadable spool file ${name}`)
      fs.rmSync(path.join(dir(), name), { force: true })
    }
  }
  return metas.sort((a, b) => a.ts - b.ts)
}
