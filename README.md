# Grok Build GUI

A function-first Windows desktop client for the locally installed Grok Build CLI. It uses the official Agent Client Protocol (ACP) instead of embedding or scraping a terminal.

## Development

```powershell
npm install
npm test
npm run build
npm run dev
```

The app defaults to `C:\Users\111\.grok\bin\grok.exe`. Change the executable in Settings if the local installation moves.

## Architecture

- `src/main`: Electron lifecycle, safe IPC, local session index, Grok process and ACP client.
- `src/preload`: the typed, allowlisted renderer bridge.
- `src/shared`: stable event, settings, attachment and shortcut contracts.
- `src/renderer`: React workbench, virtualized transcript, Markdown, search, settings and permissions.
- `tests`: unit and renderer behavior tests.

The renderer is sandboxed with Node integration disabled. It never reads `auth.json`, and the app does not enable Grok debug files.

## Capability policy

ACP-advertised features are rendered natively. Unsupported operations are shown in the feature matrix and routed to the real Grok TUI. The GUI does not simulate terminal keystrokes or parse ANSI output.
