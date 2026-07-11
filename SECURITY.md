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

The v0.3.0 local installer is unsigned because no Windows code-signing certificate is configured. A checksum, SBOM, source build instructions, and GitHub Actions build are provided, but they are not substitutes for Authenticode signing.
