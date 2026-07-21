// Authenticode gate for the release flow.
//
// Two modes, both fail loudly rather than letting an unsigned artifact pass as
// signed (roadmap issue #1: "CI/release automation fails safely when signing is
// expected but unavailable"):
//
//   node scripts/verify-signature.mjs <file>            report only, exit 0
//   node scripts/verify-signature.mjs <file> --required  must be Valid, else exit 1
//
// Windows-only (uses Get-AuthenticodeSignature). On other platforms it refuses
// to claim anything rather than pretending to verify.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const [, , target, ...flags] = process.argv
const required = flags.includes('--required')

if (!target) {
  process.stderr.write('usage: verify-signature.mjs <file> [--required]\n')
  process.exit(2)
}
if (!existsSync(target)) {
  process.stderr.write(`verify-signature: file not found: ${target}\n`)
  process.exit(2)
}
if (process.platform !== 'win32') {
  const message = 'verify-signature: Authenticode can only be verified on Windows; refusing to report a result.\n'
  process.stderr.write(message)
  process.exit(required ? 1 : 0)
}

const script = `
$ErrorActionPreference = 'Stop'
$sig = Get-AuthenticodeSignature -LiteralPath '${target.replace(/'/g, "''")}'
$cert = $sig.SignerCertificate
[pscustomobject]@{
  status     = [string]$sig.Status
  message    = [string]$sig.StatusMessage
  subject    = if ($cert) { [string]$cert.Subject } else { $null }
  issuer     = if ($cert) { [string]$cert.Issuer } else { $null }
  thumbprint = if ($cert) { [string]$cert.Thumbprint } else { $null }
  notAfter   = if ($cert) { $cert.NotAfter.ToString('o') } else { $null }
  timestamp  = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject } else { $null }
} | ConvertTo-Json -Compress
`

const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  windowsHide: true,
  timeout: 60_000
})
const info = JSON.parse(stdout.trim())

process.stdout.write(`${JSON.stringify(info, null, 2)}\n`)

if (info.status === 'Valid') {
  if (!info.timestamp) {
    // Without a timestamp the signature dies with the certificate.
    process.stderr.write('verify-signature: signature is Valid but NOT timestamped — it will stop validating when the certificate expires.\n')
    if (required) process.exit(1)
  }
  process.exit(0)
}

if (required) {
  process.stderr.write(`verify-signature: expected a Valid Authenticode signature, got "${info.status}" (${info.message}).\n`)
  process.exit(1)
}

process.stderr.write(`verify-signature: artifact is not signed (status: ${info.status}). This build is a community unsigned build.\n`)
process.exit(0)
