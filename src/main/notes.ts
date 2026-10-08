import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { JournalEntry } from '@shared/types'
import { getSettings } from './settings'
import { hhmm } from './ai/prompts'

const pad = (n: number) => String(n).padStart(2, '0')

export const dayKey = (d: Date | number = new Date()): string => {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export const hourKey = (d: Date | number): string => `${dayKey(d)}T${pad(new Date(d).getHours())}`

const SUMMARY_START = '<!-- claptrap:day-summary:start -->'
const SUMMARY_END = '<!-- claptrap:day-summary:end -->'

export const notePath = (day: string): string => path.join(getSettings().notesDir, `${day}.md`)

function ensureNote(day: string): string {
  const file = notePath(day)
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const [y, m, d] = day.split('-').map(Number)
    const title = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    fs.writeFileSync(file, `# ${title}\n\n${SUMMARY_START}\n${SUMMARY_END}\n\n## Log\n\n`)
  }
  return file
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export function appendEntry(e: JournalEntry): void {
  const details = e.details ? ` — ${oneLine(e.details)}` : ''
  fs.appendFileSync(ensureNote(dayKey(e.ts)), `- **${hhmm(e.ts)}** ${oneLine(e.activity)}${details} · _${oneLine(e.app)}_\n`)
}

export function appendHourlyRecap(day: string, label: string, text: string): void {
  fs.appendFileSync(ensureNote(day), `\n> **${label} recap:** ${oneLine(text)}\n\n`)
}

/** Writes (or replaces) the day summary block near the top of the note. */
export function writeDaySummary(day: string, markdown: string): void {
  const file = ensureNote(day)
  const body = fs.readFileSync(file, 'utf8')
  const block = `${SUMMARY_START}\n## Day Summary\n\n${markdown.trim()}\n${SUMMARY_END}`
  const start = body.indexOf(SUMMARY_START)
  const end = body.indexOf(SUMMARY_END)
  let next: string
  if (start !== -1 && end > start) {
    next = body.slice(0, start) + block + body.slice(end + SUMMARY_END.length)
  } else {
    // Markers were removed by hand; put the summary right after the title line.
    const nl = body.indexOf('\n')
    next = nl === -1 ? `${body}\n\n${block}\n` : `${body.slice(0, nl + 1)}\n${block}\n${body.slice(nl + 1)}`
  }
  fs.writeFileSync(file, next)
}

// ---- structured journal (input for summaries; kept in app data, not ~/Notes)

const journalPath = (day: string) => path.join(app.getPath('userData'), 'journal', `${day}.jsonl`)

export function appendJournal(e: JournalEntry): void {
  const file = journalPath(dayKey(e.ts))
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(e)}\n`)
}

export function readJournal(day: string): JournalEntry[] {
  try {
    return fs
      .readFileSync(journalPath(day), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry)
  } catch {
    return []
  }
}
