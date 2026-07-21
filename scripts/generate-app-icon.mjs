// Obsidian Voyage app icon builder — concept 04「曲速艦首」(warp prow).
// Renders the vector master at multiple sizes via headless chromium and packs a
// PNG-entry ICO. Outputs: build/icon.svg (master), build/icon.png (256), build/icon.ico.
import { chromium } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')

/**
 * size-aware master: small raster sizes need thicker relative strokes and no streak clutter.
 * Geometry: swallow-tail prow aimed upper-right; champagne-gold edges; ice-blue warp trail.
 */
function iconSvg({ detail }) {
  const s = detail ? { outline: 3, spine: 2.2, facet: 1.6 } : { outline: 7, spine: 5, facet: 4 }
  const streaks = detail
    ? `
  <g stroke-linecap="round">
    <line x1="34" y1="216" x2="120" y2="172" stroke="url(#ice)" stroke-width="7" opacity=".85" />
    <line x1="58" y1="238" x2="132" y2="200" stroke="url(#ice)" stroke-width="5" opacity=".6" />
    <line x1="22" y1="184" x2="86" y2="152" stroke="url(#ice)" stroke-width="4" opacity=".5" />
  </g>
  <ellipse cx="128" cy="196" rx="46" ry="26" fill="url(#glow)" opacity=".5" />`
    : ''
  const stars = detail
    ? `
  <g fill="#dbe7ff">
    <circle cx="52" cy="54" r="2.2" opacity=".8" />
    <circle cx="216" cy="196" r="1.8" opacity=".6" />
    <circle cx="196" cy="230" r="1.4" opacity=".5" />
    <circle cx="34" cy="120" r="1.4" opacity=".5" />
  </g>
  <path d="M60 186 l3.2 7.4 7.4 3.2 -7.4 3.2 -3.2 7.4 -3.2 -7.4 -7.4 -3.2 7.4 -3.2 z" fill="#f5d9a0" opacity=".9" />`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="100%" height="100%">
  <defs>
    <radialGradient id="space" cx="58%" cy="30%" r="85%">
      <stop offset="0%" stop-color="#101a33" />
      <stop offset="55%" stop-color="#080d1a" />
      <stop offset="100%" stop-color="#04060d" />
    </radialGradient>
    <linearGradient id="ice" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#6fb7ff" stop-opacity="0" />
      <stop offset="100%" stop-color="#8fd0ff" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5aa8f2" stop-opacity=".55" />
      <stop offset="100%" stop-color="#5aa8f2" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="goldEdge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5d9a0" />
      <stop offset="60%" stop-color="#e9ad47" />
      <stop offset="100%" stop-color="#b97f22" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="248" height="248" rx="56" fill="url(#space)" />
  ${streaks}
  <g>
    <polygon points="198,54 122,94 84,204 142,170" fill="#0a0f18" />
    <polygon points="198,54 142,170 176,214 208,124" fill="#111826" />
    <polygon points="122,94 84,204 142,170" fill="#070b12" />
    <polygon points="142,170 176,214 208,124" fill="#0d1320" />
    <polygon points="198,54 122,94 84,204 142,170 176,214 208,124" fill="none"
      stroke="url(#goldEdge)" stroke-width="${s.outline}" stroke-linejoin="round" />
    <line x1="198" y1="54" x2="142" y2="170" stroke="#f5d9a0" stroke-width="${s.spine}" opacity=".95" />
    <line x1="122" y1="94" x2="142" y2="170" stroke="#e9ad47" stroke-width="${s.facet}" opacity=".8" />
    <line x1="208" y1="124" x2="142" y2="170" stroke="#e9ad47" stroke-width="${s.facet}" opacity=".8" />
  </g>
  ${stars}
</svg>`
}

function packIco(entries) {
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dirs = []
  let offset = 6 + count * 16
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16)
    dir.writeUInt8(size >= 256 ? 0 : size, 0)
    dir.writeUInt8(size >= 256 ? 0 : size, 1)
    dir.writeUInt8(0, 2)
    dir.writeUInt8(0, 3)
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    offset += png.length
  }
  return Buffer.concat([header, ...dirs, ...entries.map((entry) => entry.png)])
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
await mkdir(buildDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
const entries = []
for (const size of sizes) {
  const detail = size >= 64
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${iconSvg({ detail })}`
  )
  const png = await page.screenshot({ omitBackground: true, type: 'png' })
  entries.push({ size, png })
}
await browser.close()

await writeFile(path.join(buildDir, 'icon.svg'), iconSvg({ detail: true }), 'utf8')
await writeFile(path.join(buildDir, 'icon.png'), entries.find((entry) => entry.size === 256).png)
await writeFile(path.join(buildDir, 'icon.ico'), packIco(entries))
process.stdout.write(`icon.ico written (${entries.length} sizes: ${sizes.join('/')})\n`)
