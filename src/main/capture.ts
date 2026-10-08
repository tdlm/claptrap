import { desktopCapturer, screen, systemPreferences, type NativeImage } from 'electron'
import { activeWindow, openWindows } from 'get-windows'

export interface FrontWindow {
  app: string
  bundleId?: string
  title?: string
  url?: string
  bounds?: { x: number; y: number; width: number; height: number }
}

const permissionOptions = () => ({
  // Passing false avoids get-windows triggering its own permission prompts.
  accessibilityPermission: systemPreferences.isTrustedAccessibilityClient(false),
  screenRecordingPermission: systemPreferences.getMediaAccessStatus('screen') === 'granted'
})

export async function getFrontWindow(): Promise<FrontWindow | null> {
  try {
    const win = await activeWindow(permissionOptions())
    if (!win) return null
    return {
      app: win.owner.name,
      bundleId: 'bundleId' in win.owner ? win.owner.bundleId : undefined,
      title: win.title || undefined,
      url: 'url' in win ? win.url : undefined,
      bounds: win.bounds
    }
  } catch {
    return null
  }
}

export async function listRunningApps(): Promise<{ name: string; bundleId?: string }[]> {
  try {
    const wins = await openWindows(permissionOptions())
    const apps = new Map<string, { name: string; bundleId?: string }>()
    for (const w of wins) {
      const bundleId = 'bundleId' in w.owner ? w.owner.bundleId : undefined
      apps.set(bundleId ?? w.owner.name, { name: w.owner.name, bundleId })
    }
    return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export interface Capture {
  jpeg: Buffer
  fingerprint: Uint8Array
}

// Claude's vision sweet spot: long edge <= 1568px and roughly <= 1.15 megapixels.
const MAX_EDGE = 1568
const MAX_PIXELS = 1_150_000

/** Captures the display containing the frontmost window (or the cursor). */
export async function captureDisplay(front: FrontWindow | null): Promise<Capture> {
  const point = front?.bounds
    ? { x: front.bounds.x + front.bounds.width / 2, y: front.bounds.y + front.bounds.height / 2 }
    : screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const w = display.size.width * display.scaleFactor
  const h = display.size.height * display.scaleFactor
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)))

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(w * scale), height: Math.round(h * scale) }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture returned nothing')

  return { jpeg: source.thumbnail.toJPEG(72), fingerprint: fingerprint(source.thumbnail) }
}

const FP_W = 48
const FP_H = 30

function fingerprint(img: NativeImage): Uint8Array {
  const bmp = img.resize({ width: FP_W, height: FP_H, quality: 'good' }).toBitmap()
  const out = new Uint8Array(FP_W * FP_H)
  for (let i = 0; i < out.length; i++) out[i] = (bmp[i * 4] + bmp[i * 4 + 1] + bmp[i * 4 + 2]) / 3
  return out
}

/** Mean absolute difference between two fingerprints, 0 (identical) to 1. */
export function difference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 1
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / (a.length * 255)
}
