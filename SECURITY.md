# Security policy

## Supported version

Security fixes are currently provided for the latest published release.

## Report a vulnerability

Please use GitHub's private **Report a vulnerability** / Security Advisory flow. Do not publish credentials, API keys, local transcripts, or a working exploit in a public issue.

Include the affected version, Windows version, reproduction steps, impact, and the smallest safe proof of concept. Maintainers should acknowledge a valid report before discussing disclosure timing.

## Security boundaries

- The renderer is sandboxed, context-isolated, and has Node integration disabled.
- Renderer access to Electron is limited to the typed preload bridge.
- External links are restricted to HTTP(S).
- Session deletion validates the session id and invokes the real Grok CLI without a shell.
- The app does not read Grok authentication files or enable Grok debug logs.
- The app can request powerful actions through Grok Build. Users must still review permission prompts.

## Release status

Released installers are currently **unsigned**: no Windows code-signing certificate is configured yet. A SignPath Foundation OSS certificate has been selected and the release automation is already in place (`.github/workflows/release-signed.yml`), pending approval.

A checksum (`SHA256SUMS.txt`), an SBOM (`sbom.cdx.json`), source build instructions, and a clean-environment GitHub Actions build are provided with every release, but none of them substitute for Authenticode signing.

Signing will not, on its own, remove SmartScreen warnings: an OV certificate replaces "unknown publisher" with a verified identity, while reputation still accumulates over time. See [docs/signing-trust-chain.md](docs/signing-trust-chain.md) for the full trust chain, verification commands, and the fail-safe behaviour when signing is unavailable.
