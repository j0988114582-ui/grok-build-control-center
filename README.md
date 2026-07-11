# Grok Build Control Center

> Unofficial Windows desktop control center for the locally installed Grok Build CLI.

Grok Build Control Center turns Grok Build's structured ACP interface into a readable Windows app. It is designed for people who do not want to operate a terminal: choose a project folder, describe the task in plain language, and review permissions inside the app.

This project is not affiliated with or endorsed by xAI. Grok and Grok Build are trademarks of their respective owner.

## Install on Windows

Requirements:

- Windows 10 or 11, x64
- Grok Build CLI installed and signed in

Steps:

1. Open the latest GitHub Release.
2. Download `Grok-Build-Control-Center-Setup-0.3.0.exe` and `SHA256SUMS.txt`.
3. Verify the installer checksum before opening it.
4. Run the installer. It installs only for your Windows account and does not request administrator access.
5. Open the app and click **選擇專案開始**.

The v0.3.0 community build is currently unsigned. Windows SmartScreen may show a warning. Only continue if the SHA-256 value matches the release checksum. Code signing is tracked as a release requirement, not represented as complete.

## First task

1. Click **選擇專案開始**.
2. Choose the folder containing the files you want Grok to work on.
3. Type the task in the box at the bottom and press Enter.
4. When Grok asks for permission, read the action and choose one of the offered options.

Useful keys: `Ctrl+Shift+P` opens command search, and `?` shows all shortcuts. Unsent text is saved locally after 500 ms.

## What v0.3.0 includes

- ACP-native sessions, streaming messages, tools, permissions, modes, and models
- Weekly subscription usage and reset countdown
- Project-grouped sessions, local rename, search, export, and persistent drafts
- Accessible model picker and searchable command palette
- Copyable syntax-highlighted code blocks
- Reading-first and deep-immersion galaxy modes
- Optional cursor effects with reduced-motion and background-pause support
- Virtualized long transcripts and a Canvas2D fallback when WebGL is unavailable

This is not a full IDE, a multi-model chat platform, or a replacement for Grok Build authentication. Unsupported operations route to the real Grok TUI instead of simulating terminal keystrokes.

## Trust and privacy

- Renderer sandbox enabled; Node integration disabled
- Typed, allowlisted preload bridge
- No telemetry
- No direct reading of `auth.json`
- Grok CLI remains responsible for authentication and model/network traffic
- Local settings contain preferences, title overrides, and unfinished drafts

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [BUILDING.md](BUILDING.md).

## Development

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

The verified development environment for v0.3.0 is Node.js 22.22.0 and npm 10.9.4 on Windows. See [BUILDING.md](BUILDING.md) for reproducible steps and artifact verification.

## Architecture

- `src/main`: Electron lifecycle, safe IPC, local session index, Grok process, and ACP client
- `src/preload`: typed, allowlisted renderer bridge
- `src/shared`: stable event, settings, attachment, billing, and shortcut contracts
- `src/renderer`: React workbench, virtualized transcript, Markdown, search, settings, and effects
- `tests`: unit and renderer behavior tests
- `work`: live CLI and Electron smoke checks that do not send a prompt unless explicitly named

## License

[MIT](LICENSE)
