// Generates the menu bar template icons (resources/) and the app icon (build/icon.png)
// with a tiny dependency-free rasterizer. Run: npm run icons
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(import.meta.dirname, '..')

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- rasterizer -------------------------------------------------------------
// shade(u, v) -> [r, g, b, a] in 0..1 for normalized coords; supersampled.

function render(size, shade, ss = 4) {
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size)
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca
        }
      }
      const i = (y * size + x) * 4
      const n = ss * ss
      out[i] = a ? Math.round((r / a) * 255) : 0
      out[i + 1] = a ? Math.round((g / a) * 255) : 0
      out[i + 2] = a ? Math.round((b / a) * 255) : 0
      out[i + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a]
const dist = (u, v, cx = 0.5, cy = 0.5) => Math.hypot(u - cx, v - cy)
const CLEAR = [0, 0, 0, 0]
const INK = [0, 0, 0, 1]

// ---- menu bar template icons (black + alpha; macOS tints them) -------------

const trayShapes = {
  watching: (u, v) => {
    const d = dist(u, v)
    if (d > 0.36 && d < 0.47) return INK // housing ring
    if (d < 0.17) return INK // pupil
    return CLEAR
  },
  paused: (u, v) => {
    const d = dist(u, v)
    if (d > 0.36 && d < 0.47) return INK
    if (d < 0.36 && Math.abs(v - 0.5) < 0.06) return INK // closed lid line
    return CLEAR
  },
  alert: (u, v) => {
    const d = dist(u, v)
    if (d > 0.36 && d < 0.47) return INK
    const a = Math.abs((u - 0.5) - (v - 0.5)) / Math.SQRT2
    const b = Math.abs((u - 0.5) + (v - 0.5)) / Math.SQRT2
    if (d < 0.25 && (a < 0.055 || b < 0.055)) return INK // X
    return CLEAR
  }
}

fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
for (const [name, shape] of Object.entries(trayShapes)) {
  const base = `tray${name[0].toUpperCase()}${name.slice(1)}Template`
  fs.writeFileSync(path.join(root, 'resources', `${base}.png`), encodePng(18, 18, render(18, shape, 6)))
  fs.writeFileSync(path.join(root, 'resources', `${base}@2x.png`), encodePng(36, 36, render(36, shape, 6)))
}

// ---- app icon -----------------------------------------------------------------

function roundedRect(u, v, inset, radius) {
  const x = Math.max(Math.abs(u - 0.5) - (0.5 - inset - radius), 0)
  const y = Math.max(Math.abs(v - 0.5) - (0.5 - inset - radius), 0)
  return Math.hypot(x, y) - radius // < 0 inside
}

function appIcon(u, v) {
  const box = roundedRect(u, v, 0.09, 0.19)
  if (box > 0) {
    // soft drop shadow under the tile
    const s = roundedRect(u - 0.012, v - 0.02, 0.09, 0.19)
    return s < 0.02 ? [0, 0, 0, 0.35 * (1 - Math.max(0, s) / 0.02)] : CLEAR
  }
  if (box > -0.022) return hex('#141110') // ink outline

  const d = dist(u, v, 0.5, 0.5)
  // bolts in the corners
  for (const [cx, cy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
    const bd = dist(u, v, cx, cy)
    if (bd < 0.03) return bd > 0.021 ? hex('#141110') : bd < 0.012 && u < cx && v < cy ? hex('#d9d2cc') : hex('#5b5654')
  }
  // eye housing
  if (d < 0.315) {
    if (d > 0.295) return hex('#141110')
    if (d > 0.2) return hex('#3a3634')
    if (d > 0.185) return hex('#141110')
    // lens: radial cyan with a highlight
    if (dist(u, v, 0.45, 0.44) < 0.045) return hex('#ffffff')
    if (d < 0.07) return hex('#141110')
    const t = d / 0.185
    return [0.25 * (1 - t) + 0.04 * t, 0.88 * (1 - t) + 0.24 * t, 0.94 * (1 - t) + 0.28 * t, 1]
  }
  // cyan glow ring around the housing
  if (d < 0.36) {
    const g = 1 - (d - 0.315) / 0.045
    return [0.25 + 0.71 * (1 - g), 0.88 * g + 0.72 * (1 - g), 0.94 * g + 0, 1]
  }
  // yellow plate with a gradient and hatched shadow on the lower right
  const shade = 1 - 0.18 * v
  const base = [0.96 * shade, 0.72 * shade, 0, 1]
  const hatch = (u + v) > 1.2 && ((u * 1024 + v * 1024) % 28) < 7
  return hatch ? [0.55 * shade, 0.38 * shade, 0.05, 1] : base
}

fs.mkdirSync(path.join(root, 'build'), { recursive: true })
const pngs = new Map()
for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  pngs.set(size, encodePng(size, size, render(size, appIcon, size >= 512 ? 2 : 4)))
}
fs.writeFileSync(path.join(root, 'build', 'icon.png'), pngs.get(1024))

// .icns is a header plus typed chunks; modern types simply embed PNG data.
const ICNS_TYPES = [
  ['icp4', 16], ['icp5', 32], ['ic11', 32], ['icp6', 64], ['ic12', 64],
  ['ic07', 128], ['ic08', 256], ['ic13', 256], ['ic09', 512], ['ic14', 512], ['ic10', 1024]
]
const entries = ICNS_TYPES.map(([type, size]) => {
  const head = Buffer.alloc(8)
  head.write(type, 0, 'ascii')
  head.writeUInt32BE(pngs.get(size).length + 8, 4)
  return Buffer.concat([head, pngs.get(size)])
})
const icnsHead = Buffer.alloc(8)
icnsHead.write('icns', 0, 'ascii')
icnsHead.writeUInt32BE(8 + entries.reduce((n, e) => n + e.length, 0), 4)
fs.writeFileSync(path.join(root, 'build', 'icon.icns'), Buffer.concat([icnsHead, ...entries]))
console.log('Icons written to resources/ and build/icon.{png,icns}')
