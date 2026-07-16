# Grok Build GUI Integration Plan

**Date:** 2026-07-16  
**GUI:** `j0988114582-ui/grok-build-control-center` v0.4.1 (Windows Electron)  
**Official SHAs:**

| Repo | HEAD |
|---|---|
| xai-org/grok-build | `b189869b7755d2b482969acf6c92da3ecfeffd36` |
| xai-org/plugin-marketplace | `d9f49e8b7c79fc3cc7bf8951669558ce8ca67486` |
| xai-org/grok-build-plugin-cc | `5a9f924a8d1ca802b3e6dc0ce0e1a602fb35ec9e` |

**Current GUI approach (baseline):** spawn local `grok` with  
`agent [--always-approve] --no-leader stdio` and drive it via `@agentclientprotocol/sdk` **1.2.1** NDJSON over stdio (`src/main/acp-client.ts`, `src/main/grok-cli.ts`).

Companion docs: `grok-build-official-source-analysis.md`, `grok-build-official-file-map.csv`.

---

## 1. Goals

1. Keep Jackie’s product as a **Windows Chinese-first unofficial control center** — not a TUI clone.
2. Stay on **official binaries** + **official ACP surface** so upgrades track xAI releases.
3. Use open-source harness only as a **protocol and behavior oracle**, not as a forked runtime.
4. Expand features that official code already exposes but the GUI underuses.
5. Preserve trust: sandbox renderer, no token storage, clear permission UX, no trademark confusion.

---

## 2. Integration options (compare)

### Option A — ACP stdio subprocess (**current / recommended primary**)

```
Electron main  --spawn-->  grok agent --no-leader stdio
     |  NDJSON ACP JSON-RPC on stdin/stdout
     v
@agentclientprotocol/sdk ClientConnection
```

| Pros | Cons |
|---|---|
| Official IDE integration path (`15-agent-mode.md`, docs headless ACP section) | Must handle process lifecycle / Windows kills |
| Streaming updates, permissions, modes, models, loadSession | Extension `_meta` may churn |
| Shares auth/sessions with real CLI | One process per GUI (with `--no-leader`) |
| Windows stdin isolation already fixed in agent | Client must not poison stdin with non-JSON |

**Official evidence:** `run_stdio_agent` (`app.rs` L289+); `AgentCmd::Stdio` (`cli.rs` L303–305); docs.x.ai ACP example.

**Maps to GUI today:** `buildAgentArgs` → `GrokAcpClient.start` → initialize / session/new / prompt / permissions.

**Verdict:** **Keep as primary.**

---

### Option B — Headless one-shot subprocess (`grok -p`)

```
Electron main  --spawn-->  grok -p "…" --output-format streaming-json|plain …
```

| Pros | Cons |
|---|---|
| Simple for review / batch / CI-like jobs | No interactive permission cards (prompts cancel) |
| Official flags for sandbox, allow/deny, agent profile | Poor multi-turn cockpit UX |
| Proven by **grok-build-plugin-cc** | Parallel to ACP; different session ergonomics |

**Official evidence:** docs.x.ai/build/cli/headless-scripting; `14-headless-mode.md`; plugin-cc `buildHeadlessArgs`.

**Maps to GUI:** optional **side workers** (review, critique, export-check) without replacing main chat.

**Verdict:** **Adopt as secondary** for discrete tools, inspired by plugin-cc defaults (`--permission-mode plan --sandbox read-only` unless write requested).

---

### Option C — `grok agent serve` (WebSocket local server)

```
grok agent serve --bind 127.0.0.1:2419 --secret …
Electron / multi-window clients connect via WS
```

| Pros | Cons |
|---|---|
| Multi-client reconnect | Extra auth secret surface |
| Survives client restarts mid-work | Not used by current GUI |
| Official mode | More moving parts on Windows |

**Evidence:** `AgentCmd::Serve` + `ServeArgs` (`cli.rs` L308–336); user-guide `15-agent-mode.md`.

**Verdict:** **Defer** until multi-window / remote-desktop needs appear.

---

### Option D — Leader-shared backend

```
grok agent leader   <--- stdio clients / pager
GUI with --leader (no --no-leader)
```

| Pros | Cons |
|---|---|
| Resource sharing with TUI | Complex lifecycle & routing |
| Official multi-client design | Harder isolation for unofficial app |

**Evidence:** `leader/` modules; `--leader` / `--no-leader` flags.

**Verdict:** **Avoid for default product.** Keep `--no-leader` isolation. Optional power-user setting later.

---

### Option E — Embed / link Rust crates into Electron

| Pros | Cons |
|---|---|
| In-process latency | Huge workspace; root Cargo.toml generated |
| Full control | **Windows builds best-effort untested** (README) |
| | NAPI bridge cost, version lag, support burden |
| | Trademark / “looks official” risk if binary name confuses |

**Verdict:** **Reject for roadmap horizon.** Revisit only if xAI publishes a supported embedding SDK.

---

### Option F — Fork monorepo / ship custom `grok`

| Pros | Cons |
|---|---|
| Can patch agent | External contribs closed — cannot upstream |
| | Forever rebase tax on monorepo syncs |
| | Users split from official install.ps1 channel |

**Verdict:** **Reject.** Patch behavior in the GUI client layer; report issues via security/HackerOne or public discussion channels xAI provides.

---

### Option G — Pure xAI HTTP API (no CLI harness)

| Pros | Cons |
|---|---|
| No local binary | Loses tools, permissions, sessions, MCP, skills harness |
| | Different product (chat API app, not Grok Build control center) |

**Verdict:** **Out of scope** for this product identity.

---

## 3. Recommended architecture (target)

```
┌─────────────────────────────────────────────┐
│ Renderer (React, zh-TW first, sandboxed)    │
│  chat · permissions · modes · quota · palette│
└──────────────────┬──────────────────────────┘
                   │ typed preload bridge
┌──────────────────▼──────────────────────────┐
│ Electron main                               │
│  GrokAcpClient (ACP primary)                │
│  GrokLifecycle (install / login / version)  │
│  Optional HeadlessJobRunner (plugin-cc-like)│
│  SessionIndex (local titles/drafts only)    │
└──────────────────┬──────────────────────────┘
                   │ spawn official grok.exe
┌──────────────────▼──────────────────────────┐
│ grok agent --no-leader stdio                │
│  (+ optional grok -p workers)               │
│  auth.json · sessions · config · tools      │
└─────────────────────────────────────────────┘
```

**Hard rules**

1. Only official install sources (`x.ai/cli/install.ps1` documented).
2. Never read `auth.json` in GUI.
3. Default spawn: `agent --no-leader stdio`; YOLO only when user explicitly enables.
4. Kill full process trees on stop/exit (Windows).
5. Stay clearly unofficial in UI chrome and README.

---

## 4. Gap analysis: official surface vs current GUI

| Capability | Official | GUI today | Action |
|---|---|---|---|
| ACP stdio | Yes | Yes | Maintain |
| `--no-leader` | Yes | Yes | Keep default |
| `--always-approve` | Yes | Yes (setting) | Keep high-friction |
| initialize `_meta.modelState` | Yes | Yes | Maintain normalize |
| `availableCommands` | Yes | Partially used | Command palette completeness |
| `session/set_mode` | Yes | Partial | Plan mode UX |
| `session/set_model` + effort | Yes | Yes | Align effort IDs |
| Permissions reverse-RPC | Yes | Yes | zh-TW copy polish |
| `_x.ai/billing` / `x.ai/billing` | Yes | Yes | Expand fields (history) |
| `x.ai/session/*` admin | Yes | Minimal | List/rename/delete/fork |
| `x.ai/session/load_history` | Yes | No | History restore quality |
| Image embedded_context | Agent yes | Paste-path fallback | Capability-aware send |
| `GROK_CLIENT_VERSION` | Logged by agent | Not set | Set from package version |
| `--no-auto-update` | Documented for ACP hosts | Not set | Pass or config |
| Headless side jobs | plugin-cc pattern | No | Optional review panel |
| MCP/plugin management | Full TUI + CLI | Guide to TUI | Read-only status first |
| Leader/serve | Yes | No | Defer |
| Embed crates | Source available | No | Reject |

---

## 5. Phased roadmap

### Phase 0 — Hardening (ship blockers)

| Item | Work | Official anchor |
|---|---|---|
| Process tree kill | On `stop()` / app quit, Windows `taskkill /PID /T /F` (or Job Object) like plugin-cc | `process.mjs` terminateProcessTree |
| Client version env | `GROK_CLIENT_VERSION=<gui version>` on spawn | `app.rs` L306–314 |
| Auto-update policy | Pass `--no-auto-update` if clap exposes on agent path, or document `auto_update=false` | docs headless ACP note |
| Startup/teardown races | Keep 15s initialize timeout; cancel pending permissions on exit | GUI already |
| Live smoke | Extend `work/live_acp_smoke.mjs` for billing + set_mode | docs ACP example |

### Phase 1 — ACP depth (high ROI)

1. **Plan mode** — map GUI mode chips to ACP modes from `session/new` response; call `setMode`.
2. **Session admin extensions** — `x.ai/session/list|rename|delete|fork|load_history` for richer library UI.
3. **Commands refresh** — `x.ai/commands/list` when skills/plugins change.
4. **Billing detail sheet** — use more fields from `BillingConfigResponse` (period, prepaid, history).
5. **Image path** — if prompt capabilities include images, send `ContentBlock` image; else keep paste-path.

### Phase 2 — Hybrid workers (plugin-cc lessons)

1. `HeadlessJobRunner` for “只讀審查 / 風險評論” with defaults:
   - `--permission-mode plan --sandbox read-only --output-format plain|json`
2. Job state under app data (not CLAUDE_PLUGIN_DATA); show progress lines.
3. Stop uses same tree-kill helper as ACP child.
4. Resume via `grok -r <id>` when job stored session id.

### Phase 3 — Discoverability without becoming TUI

1. Run `grok inspect --json` for project discovery panel (config, skills, plugins, MCP, instructions).
2. Read-only MCP/plugin status; deep links: “在官方 TUI 開啟 /plugins”.
3. Custom model helper that edits user `config.toml` with confirmation (official custom models doc).
4. Privacy panel calling `x.ai/privacy/*` if available after auth.

### Phase 4 — Explicit non-goals

- Full Mermaid/TUI theming parity
- Multi-account credential vault
- Reimplementing tool runtime in Node
- Bundling a forked `grok` binary as “official”
- Leader mode as default

---

## 6. Concrete spawn contracts

### Primary ACP (main chat)

```ts
// Keep aligned with src/main/grok-cli.ts
buildAgentArgs({ alwaysApprove }) => [
  'agent',
  ...(alwaysApprove ? ['--always-approve'] : []),
  '--no-leader',
  'stdio',
]

env: {
  ...process.env,
  GROK_CLIENT_VERSION: appVersion,
  // Do not inject XAI_API_KEY from GUI storage
}
stdio: ['pipe','pipe','pipe']
shell: false
windowsHide: true
```

Initialize (already):

- `protocolVersion`: SDK PROTOCOL_VERSION
- `clientInfo.name`: `Grok Build GUI`
- `clientCapabilities.fs`: disabled (agent uses host tools itself)
- Handle `session/request_permission`
- Subscribe `session/update`

### Secondary headless (side job)

Mirror plugin-cc carefully:

```text
grok -p <prompt>
  --cwd <project>
  --permission-mode plan
  --sandbox read-only
  --output-format plain
  [--model …] [--effort …]
  [-r <sessionId>]
```

Only add write / always-approve when UI is explicit.

---

## 7. Permission UX mapping

| Agent option kind | GUI recommendation (zh-TW) |
|---|---|
| allow_once | 允許這一次 |
| allow_always | 此專案一律允許（危險時二次確認） |
| reject_once | 拒絕 |
| cancel | 取消回合 |

Server-side still enforces deny rules, hooks, dangerous command re-prompt (`22-permissions-and-safety.md`). GUI must not imply that “允許” bypasses deny rules.

YOLO (`--always-approve`): require settings toggle + warning copy; show banner while active.

---

## 8. Session model

| Layer | Owner | Content |
|---|---|---|
| ACP session id | CLI | Canonical conversation |
| `~/.grok/sessions/...` | CLI | updates.jsonl, signals.json, etc. |
| GUI session index | Electron store | titles, drafts, cwd grouping |
| Billing cache | Electron memory/disk short TTL | Normalized quota rings only |

Do not treat GUI draft markdown export as substitute for `updates.jsonl`. Prefer `session/load` + extensions for true resume.

---

## 9. SDK / version strategy

| Piece | Pin | Upgrade policy |
|---|---|---|
| `@agentclientprotocol/sdk` | 1.2.1 | Bump with live smoke + capability tests |
| Official `agent-client-protocol` (Rust) | 0.10.4 in tree | Observe on each grok-build SHA refresh |
| `grok` binary | User-installed channel | Probe `grok --version`; gate features |

On each xAI CLI release: re-clone or fetch grok-build if published; re-diff `cli.rs`, `acp_agent.rs` ext methods, permissions guide.

---

## 10. Security & compliance checklist

- [ ] Unofficial branding on splash + about
- [ ] No auth.json access
- [ ] Official install URL allowlist only
- [ ] Permission default = ask
- [ ] YOLO double-confirm
- [ ] Process tree kill verified on Windows
- [ ] Plugin third-party warning if GUI ever triggers installs
- [ ] THIRD_PARTY_NOTICES for GUI deps stays current
- [ ] Apache-2.0 notices if shipping any copied official snippets (prefer not copying source)

---

## 11. Test plan (integration)

| Test | Type | Assert |
|---|---|---|
| `buildAgentArgs` | unit | includes `--no-leader stdio` |
| initialize parse | unit | loadSession, modelState, commands |
| permission select | unit | invalid option throws |
| billing normalize | unit | missing buckets → em dash semantics |
| live ACP smoke | manual/CI optional | initialize + session/new + short prompt |
| tree kill | Windows manual | no orphan grok after quit |
| reauth | manual | login clears billing cache + new ACP |

---

## 12. Decision summary

| Decision | Choice | Why |
|---|---|---|
| Primary transport | **ACP stdio** | Official IDE path; already implemented |
| Isolation | **`--no-leader`** | Simpler lifecycle; unit-tested |
| Secondary jobs | **Headless `-p`** | plugin-cc proven; good for review |
| Embed/fork | **No** | Windows build + maintenance + trademark |
| Feature strategy | **Selective ACP extensions** | Differentiate Windows UX, not full TUI |
| Auth | **CLI-owned** | Matches official security model |

---

## 13. 本 GUI 可優化發展的可能性（執行清單）

Prioritized for Jackie’s Windows Chinese-first control center:

1. **Windows 終止程序樹** — 對齊 plugin-cc `taskkill /T /F`，避免殘留 agent。  
2. **`GROK_CLIENT_VERSION` + 更新檢查策略** — 官方 stdio 診斷與 ACP 宿主建議。  
3. **Plan mode / 權限模式中文 UX** — 用既有 `setMode` + permission cards。  
4. **原生圖片 ACP block** — 有 capability 就別只靠暫存路徑。  
5. **`x.ai/session/*` 歷史與管理** — 比自建 transcript 更貼官方真相來源。  
6. **額度詳情頁** — 吃滿 billing extension 欄位，與 context 分離。  
7. **命令面板完整化** — `_meta.availableCommands` + refresh extension。  
8. **可選 headless 審查任務** — plan+read-only 預設，寫入需明確同意。  
9. **`grok inspect --json` 專案透視** — 給非終端機使用者看規則/MCP/skills。  
10. **持續對照官方 SHA** — 每次 CLI 升級重跑 file-map 關鍵路徑 diff。

---

*This plan intentionally keeps the product as a client of the official Grok Build binary. Open source improves certainty; it does not require becoming a harness fork.*
