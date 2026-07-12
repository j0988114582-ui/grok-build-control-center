# Build and verify on Windows

## Prerequisites

- Windows 10 or 11 x64
- Git
- Node.js 22.x and npm 10.x
- Grok Build CLI only for live smoke checks

## Reproducible local build

```powershell
git clone <repository-url>
Set-Location grok-build-gui
npm ci
npm run verify
```

`npm ci` uses the committed lockfile. `npm run verify` runs the full unit/UI suite, lint, both TypeScript projects, and a production build.

## Electron smoke

```powershell
npm run smoke:ui
```

This launches Electron with a temporary profile, sends no prompt, checks focus/deep/reduced-motion modes, runs serious/critical axe checks, and writes local screenshots under `outputs/ui-smoke/`. Screenshots can contain local session names and paths; the directory is gitignored.

The live feature smoke below connects to the installed CLI but sends no prompt:

```powershell
node work/live_feature_smoke.mjs
```

## Build the installer

```powershell
npm run package
```

Expected artifact:

```text
outputs/installer/Grok-Build-Control-Center-Setup-0.3.2.exe
```

Generate release evidence:

```powershell
New-Item -ItemType Directory -Force outputs/release | Out-Null
npm sbom --sbom-format cyclonedx | Set-Content -Encoding utf8 outputs/release/sbom.cdx.json
$installer = Get-Item outputs/installer/Grok-Build-Control-Center-Setup-0.3.2.exe
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installer.FullName
"$($hash.Hash.ToLower())  $($installer.Name)" | Set-Content -Encoding ascii outputs/release/SHA256SUMS.txt
```

## Signing

Do not set `CSC_IDENTITY_AUTO_DISCOVERY=false` and then describe the output as signed. A signed release requires an Authenticode certificate configured through electron-builder's documented certificate variables, followed by `Get-AuthenticodeSignature` verification on the final installer.
