import { useEffect, useState } from 'react'
import type { PermissionState } from '@shared/types'
import { Eye } from '../components/Eye'
import { Button, Check, Cross, Plate } from '../components/ui'

const api = window.claptrap

export function Permissions() {
  const [perms, setPerms] = useState<PermissionState | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      const p = await api.getPermissions()
      if (alive) setPerms(p)
    }
    void poll()
    const id = setInterval(poll, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!perms) return null
  const screenOk = perms.screen === 'granted'
  const ready = screenOk && !perms.needsRelaunch

  return (
    <main className="page permissions">
      <header className="hero">
        <Eye mood={ready ? 'happy' : screenOk ? 'sleepy' : 'blind'} size={128} />
        <div>
          <h1>{ready ? 'VISION ONLINE!' : perms.needsRelaunch ? 'ALMOST THERE!' : "I CAN'T SEE ANYTHING!"}</h1>
          <p className="sub">
            {ready
              ? 'I can see everything! Er, everything you let me see. Robot honor!'
              : perms.needsRelaunch
                ? 'macOS says yes, but I have to reboot my optics before it counts.'
                : 'Flip a couple of switches in System Settings so I can be useful!'}
          </p>
        </div>
      </header>

      <Plate
        title="Screen Recording"
        tag={<span className="tag tag-required">Required</span>}
        className={screenOk ? 'granted' : ''}
      >
        <div className="perm-row">
          {screenOk ? <Check /> : <Cross />}
          <p>
            Lets me take a screenshot every so often to figure out what you're doing. Screenshots stay in memory and are
            deleted right after I look at them.
          </p>
        </div>
        {perms.needsRelaunch ? (
          <div className="actions">
            <Button variant="cyan" onClick={() => void api.relaunch()}>
              Relaunch Claptrap
            </Button>
          </div>
        ) : (
          !screenOk && (
            <div className="actions">
              <Button onClick={() => void api.openPermissionPane('screen')}>Open Settings</Button>
              <Button variant="steel" onClick={() => void api.requestScreenRecording()}>
                Put me on the list
              </Button>
            </div>
          )
        )}
        {!screenOk &&
          (perms.isDev ? (
            <p className="hint">
              <b>Dev mode:</b> macOS credits whichever app launched <code>npm run dev</code> (your terminal, or
              "Electron"), so switch <b>that</b> on under Privacy &amp; Security → Screen &amp; System Audio Recording,
              then restart <code>npm run dev</code>. The packaged app shows up as <b>Claptrap</b>.
            </p>
          ) : (
            <p className="hint">
              In System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording, switch on{' '}
              <b>Claptrap</b>. Not listed? Click "Put me on the list" first.
            </p>
          ))}
      </Plate>

      <Plate
        title="Accessibility"
        tag={<span className="tag tag-optional">Optional</span>}
        className={perms.accessibility ? 'granted' : ''}
      >
        <div className="perm-row">
          {perms.accessibility ? <Check /> : <Cross />}
          <p>Lets me read window titles and browser URLs, so my notes say exactly which doc or page you were on.</p>
        </div>
        {!perms.accessibility && (
          <div className="actions">
            <Button onClick={() => void api.requestAccessibility()}>Ask macOS</Button>
            <Button variant="steel" onClick={() => void api.openPermissionPane('accessibility')}>
              Open Settings
            </Button>
          </div>
        )}
      </Plate>

      <footer className="footer">
        <Button variant={ready ? 'cyan' : 'steel'} onClick={() => void api.closeWindow()}>
          {ready ? "Let's go!" : 'Later'}
        </Button>
      </footer>
    </main>
  )
}
