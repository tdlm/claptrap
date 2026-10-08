import { useCallback, useEffect, useRef, useState } from 'react'
import { BATCH_OPTIONS, type BatchEvery, type ProviderId, type Settings, type SettingsView, type Status } from '@shared/types'
import { pick, voice } from '@shared/voice'
import { Eye, type EyeMood } from '../components/Eye'
import { Button, Field, Plate, Toggle } from '../components/ui'

const api = window.claptrap

const TABS = [
  { id: 'brain', label: 'Brain' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'unit', label: 'Unit' }
] as const
type Tab = (typeof TABS)[number]['id']

const PROVIDERS: { id: ProviderId; label: string; keyHint: string; modelHint: string }[] = [
  {
    id: 'gateway',
    label: 'Vercel AI Gateway',
    keyHint: 'Create one at vercel.com → AI Gateway → API Keys.',
    modelHint: 'Gateway IDs look like anthropic/claude-haiku-5.5. Hit "Fetch models" for the live list.'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyHint: 'Create one at platform.claude.com → API Keys.',
    modelHint: 'Anthropic IDs look like claude-haiku-5-5. Hit "Fetch models" for the live list.'
  }
]

const MOOD: Record<Status['state'], EyeMood> = {
  watching: 'open',
  idle: 'open',
  paused: 'sleepy',
  blind: 'blind',
  'needs-key': 'blind',
  error: 'blind'
}

export function SettingsPage() {
  const [s, setS] = useState<SettingsView | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [tab, setTab] = useState<Tab>('brain')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>(undefined)

  useEffect(() => {
    void api.getSettings().then(setS)
    void api.getStatus().then(setStatus)
    return api.onStatus(setStatus)
  }, [])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  const save = useCallback(
    async (patch: Partial<Settings>) => {
      setS(await api.updateSettings(patch))
      flash(pick(voice.saved))
    },
    [flash]
  )

  if (!s) return null

  return (
    <main className="page settings">
      <header className="hero compact">
        <Eye mood={status ? MOOD[status.state] : 'open'} size={84} />
        <div>
          <h1>Unit Configuration</h1>
          <p className="sub">{status?.message ?? 'Booting up…'}</p>
          {status?.lastEntry && <p className="last">Last log: {status.lastEntry}</p>}
          {status && (status.queued > 0 || status.processing > 0) && (
            <p className="last">
              Queued: {status.queued} · In the batch oven: {status.processing}
            </p>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'brain' && <BrainTab s={s} setS={setS} save={save} flash={flash} />}
      {tab === 'eyes' && <EyesTab s={s} save={save} />}
      {tab === 'notebook' && <NotebookTab s={s} save={save} />}
      {tab === 'unit' && <UnitTab s={s} save={save} />}

      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

type TabProps = { s: SettingsView; save: (patch: Partial<Settings>) => Promise<void> }

function BrainTab({ s, setS, save, flash }: TabProps & { setS: (s: SettingsView) => void; flash: (m: string) => void }) {
  const provider = PROVIDERS.find((p) => p.id === s.provider)!
  const [keyDraft, setKeyDraft] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState<'fetch' | 'test' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const choice = s.models[s.provider]

  useEffect(() => {
    setModels([])
    setResult(null)
    setKeyDraft('')
  }, [s.provider])

  const saveKey = async (key: string | null) => {
    setS(await api.setApiKey(s.provider, key))
    setKeyDraft('')
    flash(key ? 'Brain installed! I feel smarter already!' : 'Key removed. I feel… emptier.')
  }

  const fetchModels = async () => {
    setBusy('fetch')
    const res = await api.listModels(s.provider)
    setBusy(null)
    if (res.ok) {
      setModels(res.models)
      setResult({ ok: true, text: `Found ${res.models.length} models. So many brains to choose from!` })
    } else setResult({ ok: false, text: res.error })
  }

  const test = async () => {
    setBusy('test')
    const res = await api.testProvider(s.provider)
    setBusy(null)
    setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error })
  }

  const setModel = (field: 'capture' | 'summary', value: string) =>
    save({ models: { ...s.models, [s.provider]: { ...choice, [field]: value.trim() } } })

  return (
    <>
      <Plate title="Provider">
        <div className="segmented">
          {PROVIDERS.map((p) => (
            <button key={p.id} className={s.provider === p.id ? 'active' : ''} onClick={() => void save({ provider: p.id })}>
              {p.label}
            </button>
          ))}
        </div>

        <Field label="API key" hint={s.hasKey[s.provider] ? 'Encrypted with your macOS Keychain.' : provider.keyHint}>
          {s.hasKey[s.provider] ? (
            <div className="row">
              <span className="pill ok">Key stored</span>
              <Button variant="danger" onClick={() => void saveKey(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="row">
              <input
                type="password"
                placeholder="Paste key…"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && keyDraft && void saveKey(keyDraft)}
              />
              <Button disabled={!keyDraft} onClick={() => void saveKey(keyDraft)}>
                Save
              </Button>
            </div>
          )}
        </Field>
      </Plate>

      <Plate title="Models">
        <datalist id="models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Field label="Eyeball model (captures + hourly recaps)" hint="Cheap and fast. It looks at each screenshot and writes the hourly recaps.">
          <ModelInput value={choice.capture} onCommit={(v) => void setModel('capture', v)} />
        </Field>
        <Field label="Big-brain model (day summary)" hint={provider.modelHint}>
          <ModelInput value={choice.summary} onCommit={(v) => void setModel('summary', v)} />
        </Field>
        <div className="actions">
          <Button variant="steel" disabled={!s.hasKey[s.provider] || busy !== null} onClick={() => void fetchModels()}>
            {busy === 'fetch' ? 'Fetching…' : 'Fetch models'}
          </Button>
          <Button variant="cyan" disabled={!s.hasKey[s.provider] || busy !== null} onClick={() => void test()}>
            {busy === 'test' ? 'Thinking…' : 'Test my brain'}
          </Button>
        </div>
        {result && <p className={`result ${result.ok ? 'ok' : 'bad'}`}>{result.text}</p>}
      </Plate>

      <Plate title="Budget" tag={<span className="tag tag-optional">Half price</span>}>
        <Field
          label="Send screenshots in a batch every"
          hint="Batched requests cost 50% less. Notes appear once a batch comes back, usually within a few minutes of sending (it can occasionally take longer). Screenshots wait in memory only, never on disk."
        >
          <select
            className="narrow-select"
            value={s.batchEverySeconds}
            onChange={(e) => void save({ batchEverySeconds: Number(e.target.value) as BatchEvery })}
          >
            {BATCH_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {BATCH_LABELS[sec]}
              </option>
            ))}
          </select>
        </Field>
      </Plate>
    </>
  )
}

const BATCH_LABELS: Record<BatchEvery, string> = {
  30: '30 seconds',
  300: '5 minutes',
  1800: '30 minutes',
  3600: 'hour'
}

function ModelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => draft.trim() && draft.trim() !== value && onCommit(draft)
  return (
    <input
      list="models"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

function NumberInput({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.min(max, Math.max(min, Number(draft) || value))
    setDraft(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <input
      type="number"
      className="narrow"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

function EyesTab({ s, save }: TabProps) {
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState<{ name: string; bundleId?: string }[]>([])

  useEffect(() => {
    void api.listRunningApps().then(setRunning)
  }, [])

  const add = (id: string) => {
    const v = id.trim()
    if (!v || s.exclusions.some((x) => x.toLowerCase() === v.toLowerCase())) return
    void save({ exclusions: [...s.exclusions, v] })
    setDraft('')
  }

  return (
    <>
      <Plate title="Capture">
        <Field label="Look every (seconds)" hint="10–300. Unchanged screens are skipped, so this mostly affects how quickly I notice switches.">
          <NumberInput value={s.intervalSeconds} min={10} max={300} onCommit={(v) => void save({ intervalSeconds: v })} />
        </Field>
        <Field label="Doze after idle (minutes)" hint="No keyboard or mouse for this long and I stop looking.">
          <NumberInput
            value={Math.round(s.idleThresholdSeconds / 60)}
            min={1}
            max={60}
            onCommit={(v) => void save({ idleThresholdSeconds: v * 60 })}
          />
        </Field>
      </Plate>

      <Plate title="Never look at" tag={<span className="tag tag-optional">Privacy</span>}>
        <p className="hint">When one of these apps is in front, I look away and log nothing. Match by bundle ID or app name.</p>
        <ul className="chips">
          {s.exclusions.map((x) => (
            <li key={x} className="chip">
              {x}
              <button aria-label={`Remove ${x}`} onClick={() => void save({ exclusions: s.exclusions.filter((e) => e !== x) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            placeholder="com.example.app or App Name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(draft)}
          />
          <Button disabled={!draft.trim()} onClick={() => add(draft)}>
            Add
          </Button>
        </div>
        {running.length > 0 && (
          <div className="row">
            <select value="" onChange={(e) => add(e.target.value)}>
              <option value="">Pick from open apps…</option>
              {running.map((a) => (
                <option key={a.bundleId ?? a.name} value={a.bundleId ?? a.name}>
                  {a.name}
                  {a.bundleId ? ` (${a.bundleId})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </Plate>
    </>
  )
}

function NotebookTab({ s, save }: TabProps) {
  const choose = async () => {
    const dir = await api.chooseNotesDir()
    if (dir) void save({ notesDir: dir })
  }
  return (
    <Plate title="Notebook">
      <Field label="Notes folder" hint="One Markdown file per day, e.g. 2026-10-07.md.">
        <div className="row">
          <input value={s.notesDir} readOnly />
          <Button variant="steel" onClick={() => void choose()}>
            Choose…
          </Button>
        </div>
      </Field>
      <Toggle
        label="Hourly recaps"
        hint="A one-to-three sentence recap at the end of each hour."
        checked={s.hourlySummaries}
        onChange={(v) => void save({ hourlySummaries: v })}
      />
      <Field label="Write the day summary at" hint="It goes at the top of the day's note. You can also do it any time from the menu bar.">
        <input
          type="time"
          className="narrow"
          value={s.dailySummaryTime}
          onChange={(e) => e.target.value && void save({ dailySummaryTime: e.target.value })}
        />
      </Field>
      <Toggle
        label="Claptrap mode"
        hint='Adds a "Claptrap says" paragraph of commentary to each day summary. The log itself stays professional.'
        checked={s.claptrapMode}
        onChange={(v) => void save({ claptrapMode: v })}
      />
    </Plate>
  )
}

function UnitTab({ s, save }: TabProps) {
  return (
    <>
      <Plate title="Chassis">
        <Toggle label="Show in Dock" hint="I live in the menu bar either way." checked={s.showInDock} onChange={(v) => void save({ showInDock: v })} />
        <Toggle
          label="Launch at login"
          hint="Only works in the packaged app."
          checked={s.launchAtLogin}
          onChange={(v) => void save({ launchAtLogin: v })}
        />
      </Plate>
      <Plate title="Sensors">
        <p className="hint">Check or fix my Screen Recording and Accessibility permissions.</p>
        <div className="actions">
          <Button onClick={() => void api.openWindow('permissions')}>Open permissions</Button>
        </div>
      </Plate>
    </>
  )
}
