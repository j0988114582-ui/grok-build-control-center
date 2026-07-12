# Account switching, beginner onboarding, and quota clarity design

## Product boundary

This release makes the existing unofficial Windows control center safer for non-technical users. It does not become a credential manager and does not install Windows Terminal or Node.js. Account switching delegates to the installed Grok CLI's official browser OAuth flow. First-time setup installs only Grok CLI, from xAI's documented Windows installer URL, after an explicit confirmation.

The GUI never reads, copies, or stores Grok credentials. It cannot show an account email because Grok CLI 0.2.93 exposes no `whoami`, profile list, or account-status command. Reauthentication stops the current ACP connection, runs `grok login --oauth`, clears cached billing state, then creates a fresh connection. A failed login leaves a clear retry path rather than pretending the old connection is still valid.

## Main-process architecture

Process execution is isolated in a testable Grok lifecycle module. Dependencies for executing commands and fetching the installer are injectable in tests. The installer is downloaded from the fixed HTTPS URL `https://x.ai/cli/install.ps1` into a temporary file, checked for a non-empty PowerShell payload, executed without elevation, and removed afterward. Success is accepted only when the expected per-user executable exists and returns a parseable `grok --version` response.

IPC exposes two bounded operations: install Grok CLI and reauthenticate. Both reject concurrent runs. The renderer receives progress through the existing status channel. Settings move to the verified default executable after a successful first-time install. ACP and billing caches are invalidated around reauthentication so models, modes, commands, and quota data cannot leak across accounts.

## Renderer and quota UX

When the CLI is missing, the main onboarding action becomes "安裝 Grok CLI" and opens a confirmation dialog that names xAI and the official URL. Account switching opens a separate warning dialog explaining that a browser will open and that the app does not keep passwords or tokens.

The title bar quota display grows vertically and always lists Total, Build, Imagine, and API. Values come only from `_x.ai/billing`. Missing product buckets render as `—` with "服務未提供" semantics; no value is inferred from the total. Context-window usage remains separate because it is a per-session token window, not subscription billing.

## Review hardening and verification

Before feature work, connection/session capability state must distinguish an explicitly empty list from a missing field, permission dialogs must focus a safe reject/cancel target, new sessions must reset follow-tail state, and failed WebGL restoration must stop or fall back instead of running an empty RAF loop. Packaging adds third-party license notices while keeping `node_modules` excluded.

Tests cover red/green behavior for every new pure helper, bridge contract, renderer action, quota placeholder, and review regression. Release verification is `npm run verify`, the no-prompt live CLI smoke, UI/axe smoke, packaging, packaged-app launch, and installer signature readback. The installer remains unsigned and must be described that way.
