# Privacy

Grok Build Control Center does not include telemetry, analytics, advertising, or crash-report uploads.

## Data stored locally

Electron Store keeps:

- appearance and accessibility preferences
- Grok executable path
- keyboard shortcuts
- local session title overrides
- recent command ids
- unfinished text drafts

Grok Build session transcripts remain in Grok CLI's own local session storage. Exported files are written only after the user chooses a destination.

## Network behavior

The desktop app communicates with the locally installed Grok CLI over stdio using ACP. The Grok CLI is responsible for authentication and its network requests to xAI services. Weekly usage is requested through the CLI's `_x.ai/billing` ACP extension.

The app itself opens an external HTTP(S) URL only after the user clicks a link. It does not read `auth.json`, copy API keys, or send local settings to this project's maintainers.

## Diagnostic reports

No diagnostic report is uploaded automatically. Before sharing logs or screenshots, remove usernames, local paths, repository names, prompts, transcripts, and secrets.
