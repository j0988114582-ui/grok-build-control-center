import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const groups = new Map()
const missing = []

for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  if (!location.startsWith('node_modules/') || metadata.dev === true) continue
  const directory = path.join(root, location)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  const name = manifest.name ?? location.slice('node_modules/'.length)
  const version = manifest.version ?? metadata.version ?? 'unknown'
  const license = typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license ?? 'UNKNOWN')
  const label = `${name}@${version} (${license})`
  const files = await readdir(directory)
  const licenseFile = files.find((file) => /^(licen[sc]e|copying|notice)(\.[^.]+)?$/i.test(file))
  if (!licenseFile) {
    missing.push(label)
    continue
  }
  const text = (await readFile(path.join(directory, licenseFile), 'utf8')).trim()
  if (!text) {
    missing.push(label)
    continue
  }
  const group = groups.get(text) ?? []
  group.push(label)
  groups.set(text, group)
}

const sections = [
  'THIRD-PARTY SOFTWARE NOTICES',
  'Generated from production dependencies in package-lock.json.',
  'This file is informational and does not alter the licenses of the listed packages.'
]

for (const [licenseText, packages] of [...groups.entries()].sort((a, b) => a[1][0].localeCompare(b[1][0]))) {
  sections.push('', '='.repeat(78), packages.sort().join('\n'), '-'.repeat(78), licenseText)
}

if (missing.length) {
  sections.push('', '='.repeat(78), 'PACKAGES WITHOUT A DISTRIBUTED LICENSE FILE', '-'.repeat(78), missing.sort().join('\n'))
}

await writeFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), `${sections.join('\n')}\n`, 'utf8')
