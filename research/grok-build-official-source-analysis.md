# Official Grok Build Source Analysis (for GUI optimization)

**Research session date:** 2026-07-16  
**GUI target:** `j0988114582-ui/grok-build-control-center` (Windows Electron GUI, v0.4.1)  
**Hard source policy:** primary evidence only from `github.com/xai-org`, `x.ai`, `docs.x.ai`.  
**Local clones:** `C:\Users\demo\Documents\grok-build-GUI\work\official-src\`

---

## Provenance record (verified)

| Repository | Remote | HEAD SHA | Recent log |
|---|---|---|---|
| [xai-org/grok-build](https://github.com/xai-org/grok-build) | `https://github.com/xai-org/grok-build.git` | `b189869b7755d2b482969acf6c92da3ecfeffd36` | `b189869 Publish harness and TUI open-source` (single public commit) |
| [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) | `https://github.com/xai-org/plugin-marketplace.git` | `d9f49e8b7c79fc3cc7bf8951669558ce8ca67486` | includes Railway, pptx/docx skills, figma, axiom, Firecrawl, neon… |
| [xai-org/grok-build-plugin-cc](https://github.com/xai-org/grok-build-plugin-cc) | `https://github.com/xai-org/grok-build-plugin-cc.git` | `5a9f924a8d1ca802b3e6dc0ce0e1a602fb35ec9e` | `5a9f924 feat: Grok Build Claude Code plugin` |

All three remotes confirmed as **`xai-org`**.

### Other xai-org repos related to Grok Build (org listing, 2026-07-16)

| Repo | Relevance to this GUI |
|---|---|
| `grok-build` | **Primary** — CLI/TUI/agent/ACP source |
| `plugin-marketplace` | Official plugin catalog |
| `grok-build-plugin-cc` | Reference integration that shells out to `grok` |
| `xai-sdk-python` | API SDK (not ACP) |
| `xai-proto` | gRPC public protos |
| `xai-cookbook` | API examples |
| `grok-prompts` / `grok-1` / `x-algorithm` | Not the coding-agent harness |

Official announcements / product pages:

- Open-source announcement: https://x.ai/news/grok-build-open-source (2026-07-15)
- Product page: https://x.ai/cli
- Docs hub: https://docs.x.ai/build/overview

---

## 1. Product definition (official)

Grok Build (`grok`) is SpaceXAI’s terminal coding agent: full-screen TUI, headless scripting, and **ACP (Agent Client Protocol)** for embedding in editors/apps.

Evidence:

- README: `work/official-src/grok-build/README.md` — “interactively, headlessly… or embedded… via ACP”
- Docs: https://docs.x.ai/build/overview — “interactive TUI, headlessly… or through ACP”
- User guide: `crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md`

The public tree is **synced periodically from the SpaceXAI monorepo** (README). External PRs are **not accepted** (`CONTRIBUTING.md`).

---

## 2. License, trademark, contribution policy

| Topic | Fact | Evidence |
|---|---|---|
| First-party license | **Apache-2.0** | `LICENSE`, README License section |
| Copyright | Copyright 2023-2026 SpaceXAI | `LICENSE` L1 |
| External contributions | **Not accepted** | `CONTRIBUTING.md` |
| Security reports | HackerOne `https://hackerone.com/x` | `SECURITY.md` |
| Third-party code | Separate notices (crates.io, codex/opencode ports, Mermaid) | `THIRD-PARTY-NOTICES`, `xai-grok-tools/THIRD_PARTY_NOTICES.md` |
| Brand / trademarks | GUI must remain **unofficial**; do not imply xAI endorsement | GUI README already disclaims; brand use governed by xAI terms/brand guidelines (`x.ai/legal/*`) |

**GUI implication:** Apache-2.0 permits reading source and building local tools. It does **not** transfer trademarks. Jackie’s MIT GUI should continue clear “unofficial / not affiliated” messaging. Forking the full Rust monorepo into the Electron product is legally possible under Apache-2.0 for the code, but operationally heavy and trademark-sensitive; **prefer subprocess + ACP**.

---

## 3. Repository architecture (crate map)

Composition root binary: `xai-grok-pager-bin` → artifact `xai-grok-pager` (installed as `grok`).

| Path | Role | GUI relevance |
|---|---|---|
| `crates/codegen/xai-grok-pager-bin` | Binary entry | Install surface |
| `crates/codegen/xai-grok-pager` | TUI + CLI clap surface | `app/cli.rs` defines `agent stdio` / flags |
| `crates/codegen/xai-grok-shell` | Agent runtime, leader/stdio/headless | **Core integration surface** |
| `crates/codegen/xai-acp-lib` | ACP channels, Windows stdin isolation | Transport robustness |
| `crates/codegen/xai-grok-tools` | Tool implementations | Permission semantics |
| `crates/codegen/xai-grok-workspace` | FS/VCS/checkpoints/permissions | Safety |
| `crates/codegen/xai-grok-mcp` | MCP client | Future GUI MCP UX |
| `crates/codegen/xai-grok-plugin-marketplace` | Marketplace client code | Plugin install UX |
| `crates/codegen/xai-grok-telemetry` | Product analytics + external OTEL | Privacy UX |
| `crates/codegen/xai-grok-config` | Config merge / managed policy | Settings alignment |
| `crates/codegen/xai-tty-utils` | Windows Job Object, CREATE_NO_WINDOW | Process lifecycle |
| `crates/common/*` | Shared tool runtime, compaction, hub | Deep embed only |

Root `Cargo.toml` is **generated / read-only** (README warning). Workspace pins `agent-client-protocol = 0.10.4` (`Cargo.toml` / `Cargo.lock`).

Pinned Rust ACP crate (agent side): **`agent-client-protocol` 0.10.4** with `unstable` features in `xai-acp-lib`.  
Current GUI client SDK: **`@agentclientprotocol/sdk` 1.2.1** (`work/_upstream/package.json`).

---

## 4. Install, platforms, build host support

**Released binaries:** macOS, Linux, Windows.

```sh
curl -fsSL https://x.ai/cli/install.sh | bash   # macOS / Linux / Git Bash
irm https://x.ai/cli/install.ps1 | iex          # Windows PowerShell
```

Evidence: README; docs.x.ai/build/overview; x.ai/cli.

**Building from this open-source tree:**

- Supported build hosts: **macOS and Linux**
- **Windows builds are best-effort and not currently tested from this tree** (README)

**GUI implication:** Prefer **official Windows install.ps1 binaries** for end users. Do not require Jackie’s users to compile `grok-build` on Windows. Source is for protocol understanding and roadmap, not for shipping a custom Windows rebuild by default.

---

## 5. CLI surface (integration-critical)

Defined in `crates/codegen/xai-grok-pager/src/app/cli.rs`.

### Top-level commands (subset)

`Agent`, `Inspect`, `Login`/`Logout`, `Mcp`, `Plugin`, `Memory`, `Models`, `Sessions`, `Setup`, `Export`, `Trace`, `Update`, `Version`, `Completions`, `Worktree`, `Dashboard`, …

### `grok agent` flags (apply before mode)

| Flag | Meaning | Evidence |
|---|---|---|
| `--always-approve` / `--yolo` | Auto-approve tools | `AgentArgs.yolo` L246–247 |
| `--no-leader` | Do not join shared leader; start dedicated agent | `AgentArgs.no_leader` L262–264 |
| `--leader` | Prefer shared leader | conflicts with `--no-leader` |
| `-m/--model` | Model ID | L235–236 |
| `--reasoning-effort` / `--effort` | Effort | L238–244 |
| `--plugin-dir DIR` | Per-process trusted plugin dirs (repeatable) | L251–256 |
| `--reauth` | Auth before start | L228–233 |

### Agent modes (`AgentCmd`)

| Mode | Command | Purpose |
|---|---|---|
| Stdio ACP | `grok agent stdio` | JSON-RPC NDJSON on stdin/stdout |
| Headless WS | `grok agent headless` | WebSocket relay |
| Serve | `grok agent serve --bind 127.0.0.1:2419` | Local WS server |
| Leader | `grok agent leader` | Shared backend for multi-client |

Unit test confirms CLI parse of Jackie’s exact args:

```text
grok agent --no-leader … stdio
```

Evidence: `cli.rs` test `agent_plugin_dir_repeatable_and_canonicalized` L960–978 — asserts `AgentCmd::Stdio` + `no_leader`.

### Headless one-shot (not ACP)

```bash
grok -p "…" --output-format plain|json|streaming-json
```

Flags include `--always-approve`, `--permission-mode`, `--allow`/`--deny`, `--sandbox`, `--resume`/`-c`, `--model`, `--effort`, `--agent`, `--json-schema`, etc.  
Official docs: https://docs.x.ai/build/cli/headless-scripting  
User guide: `14-headless-mode.md`

---

## 6. ACP stdio transport (deep)

### Official launch command

```bash
grok agent stdio
# or, isolated from leader cluster:
grok agent --no-leader stdio
# with YOLO:
grok agent --always-approve --no-leader stdio
```

Docs: https://docs.x.ai/build/cli/headless-scripting (ACP section); user-guide `15-agent-mode.md`.

### Runtime path

1. `run_stdio_agent` in `xai-grok-shell/src/agent/app.rs` L289+
2. Stdout is ACP outgoing; stdin bridged via **dedicated OS thread** `xai_acp_lib::spawn_stdin_line_reader`
3. On **Windows**, stdin is duplicated then process stdin redirected to `NUL` to avoid `StdinLock` deadlock during `session/new` (`stdin_reader.rs` module docs L17–40)
4. Agent uses `agent_client_protocol::AgentSideConnection`
5. Skills file watcher injects internal messages alongside client JSON-RPC
6. `GROK_CLIENT_VERSION` env var logged early for diagnostics (app.rs L306–314)

### Why Windows isolation matters for Electron

Electron `child_process.spawn` with `stdio: ['pipe','pipe','pipe']` is exactly the persistent-pipe ACP case the Windows fix targets. Jackie’s GUI already uses this pattern (`src/main/acp-client.ts`). Keep stdin open for the whole session; never interleave non-JSON on stdin.

### Protocol lifecycle (official docs + code)

1. `initialize` — protocolVersion V1, capabilities, authMethods, `_meta` (modelState, availableCommands, agentVersion, …)
2. Optional `authenticate` — `xai.api_key` or `cached_token` / OIDC flows
3. `session/new` / `session/load`
4. `session/prompt` + streaming `session/update`
5. `session/request_permission` reverse requests
6. `session/set_mode`, `session/set_model` (and config options)
7. `session/cancel`

Initialize capabilities (agent side) — `acp_agent.rs` ~L394–437:

- `loadSession: true`
- `promptCapabilities.embedded_context: true` (images/context blocks supported on agent)
- `mcpCapabilities.http` + `sse`
- meta: `x.ai/fs_notify`, hooks PreToolUse deny, `grokShell`, `modelState`, `availableCommands`, `agentVersion`, hostname, etc.

### Extensions (`ext_method` match arms, `acp_agent.rs` ~L3150+)

High-value extensions for GUI:

| Method | Purpose |
|---|---|
| `x.ai/billing` | Credits / weekly usage (pager/desktop) |
| `x.ai/auto-topup-rule` | Billing related |
| `x.ai/session/info`, `list`, `close`, `rename`, `delete`, `fork` | Session admin |
| `x.ai/session/load_history`, `search`, `updates` | History UX |
| `x.ai/session/update_mcp_servers` | MCP lifecycle |
| `x.ai/commands/list` | Slash commands refresh |
| `x.ai/plugins/reload`, skills refresh | Extension UX |
| `x.ai/getApiKey` / `setApiKey` / `x.ai/auth/*` | Auth helpers (GUI should still avoid becoming a credential vault) |
| `x.ai/privacy/setCodingDataRetention` | Privacy toggles |
| `x.ai/share_session` | Share URL |
| `x.ai/memory/*`, `x.ai/interject`, `x.ai/feedback`, `x.ai/btw` | Advanced |

**Wire note:** ACP extension methods are conventionally `_`-prefixed on the client SDK. Jackie’s GUI calls `_x.ai/billing` (live-validated per project AGENTS.md). Agent match arms use `x.ai/billing` after protocol/library normalization. Keep using the proven client form; do not invent alternate paths.

---

## 7. Current GUI integration baseline (verified in GUI repo)

| Item | Current state |
|---|---|
| Launch args | `['agent', optional '--always-approve', '--no-leader', 'stdio']` — `src/main/grok-cli.ts` `buildAgentArgs` |
| ACP SDK | `@agentclientprotocol/sdk` **1.2.1** |
| Transport | NDJSON over child stdin/stdout (`acp.ndJsonStream`) |
| Client info | `name: 'Grok Build GUI'`, version from package |
| Client capabilities | `fs.read/write: false`, `terminal: false`, `plan: {}` |
| Permissions | Reverse request → UI options → `respondPermission` |
| Modes / models | `session/setMode`, custom `session/set_model` |
| Billing | `_x.ai/billing` with `{}` |
| Windows | `windowsHide: true`, default exe `%USERPROFILE%\.grok\bin\grok.exe` |
| Auth | Does not read `auth.json`; triggers `grok login --oauth` for reauth |

This is **aligned with official recommended IDE/ACP path**.

---

## 8. Permissions and safety (official model)

Source of truth: `docs/user-guide/22-permissions-and-safety.md` + shell permission resolution.

### Authorization pipeline (ordered)

1. `PreToolUse` hooks (can deny)
2. Permission rules (`deny` > `ask` > `allow`) from config + Claude settings + CLI `--allow`/`--deny`
3. Remembered grants (project-scoped)
4. Built-in auto-approvals (read-only tools / safe shell segments)
5. Prompt policy from **permission mode**

### Modes

| Mode | Behavior |
|---|---|
| `default` / ask | Prompt when not pre-approved |
| `dontAsk` | Deny unless allowed / auto-approved (CI/high-security) |
| `bypassPermissions` / always-approve | Auto-approve (deny/hooks/shell ask still apply) |
| `acceptEdits` | Auto-approve edits |
| `plan` | Compatibility + plan session feature |

CLI:

- `--always-approve` / `--yolo`
- `--permission-mode`
- Admin lock: `requirements.toml` `[ui] disable_bypass_permissions_mode = true`

Headless: prompts cancel instead of blocking (`14-headless-mode.md`, docs).

### GUI implications

- Keep interactive permission cards (already correct for ACP).
- Expose always-approve as explicit dangerous toggle (already mapped to CLI flag).
- Future: surface allow/deny rule editor for `~/.grok/config.toml` / project `.grok/config.toml`.
- Future: plan mode toggle via `session/set_mode` (agent already implements `set_session_mode`).
- Never claim GUI sandboxing replaces CLI sandbox/`--sandbox` profiles.

---

## 9. Sessions

Official storage (`17-sessions.md`):

```text
~/.grok/sessions/<encoded-cwd>/<session-id>/
  summary.json
  updates.jsonl          # authoritative conversation for resume
  chat_history.jsonl
  plan.json
  rewind_points.jsonl
  signals.json           # token/tool counters
  feedback.jsonl
  compaction_checkpoints/
  subagents/
```

- Override base with `GROK_HOME`
- ACP `session/load` resumes
- Headless: `-r` / `-c` / `--session-id`
- TUI: `/resume`, `/fork`, `/dashboard`

**GUI already** maintains a local session index + titles while using real ACP session IDs. Opportunity: deepen history via `x.ai/session/load_history` / list extensions instead of re-inventing transcript parsing.

Context window usage lives in `signals.json` (per Jackie’s AGENTS.md) and is **not** the same as subscription billing.

---

## 10. Authentication

Official (`02-authentication.md`, docs overview):

| Method | When |
|---|---|
| Browser OAuth (`grok login` / first launch) | Default desktop |
| Device auth | Headless/remote |
| `XAI_API_KEY` | CI / no browser; fallback when no session token |
| OIDC enterprise | Custom IdP |

Credentials: `~/.grok/auth.json` (CLI-owned).  
ACP `authenticate` supports method selection; preferred method can be restricted by admin config.

**GUI policy (correct):** never read/copy `auth.json`; reauth via official CLI; invalidate ACP + billing cache after login.

---

## 11. Plugins, skills, marketplace, MCP, hooks

Official docs: https://docs.x.ai/build/features/skills-plugins-marketplaces

Discovery roots:

- Skills: `./.grok/skills/`, `~/.grok/skills/`, plugin skills, `[skills].paths`
- Plugins: project/user dirs, marketplaces, `--plugin-dir`
- Hooks: user/project/plugin with trust model
- MCP: stdio/http/sse (agent advertises http+sse caps)
- Claude Code zero-config compatibility (settings, CLAUDE.md, marketplaces)
- AGENTS.md family supported

### Official marketplace repo

`plugin-marketplace` is a **catalog index** (`.grok-plugin/marketplace.json`), not a runtime. Remote sources must pin full SHA. Ships default skills (docx/pptx) and external plugins (e.g. neon). Strong third-party liability disclaimer in README.

### plugin-cc integration pattern (reference)

`grok-build-plugin-cc` does **not** use ACP. It:

1. Resolves `GROK_BINARY` or `grok` on PATH
2. Probes auth via `grok models`
3. Runs **headless** `grok -p …` with flags like `--permission-mode plan --sandbox read-only`
4. Tracks jobs via PID + log files; Windows kill via `taskkill /PID /T /F`
5. Supports resume (`-r`), background workers, stop trees

Evidence: `plugins/grok-build/scripts/lib/grok.mjs`, `process.mjs`, README.

**Lesson for Jackie GUI:** headless is excellent for one-shot review/delegate tools; **ACP stdio remains superior for interactive multi-turn cockpit**. Hybrid is valid: ACP for main UX, optional headless workers for side jobs (mirroring plugin-cc).

---

## 12. Modes & slash commands (TUI reference)

Docs: https://docs.x.ai/build/modes-and-commands

Notable for GUI parity backlog:

- Plan mode (`/plan`, Shift+Tab cycle)
- Always-approve toggle
- `/model`, `/effort`, `/context`, `/usage`, `/privacy`
- `/plugins` `/skills` `/mcps` `/marketplace` unified extensions modal
- `/rewind`, `/compact`, `/export`, `/fork`
- `/imagine`, `/imagine-video` (media)
- Memory: `/memory`, `/dream`, `/flush`

GUI should not re-implement TUI; selectively surface high-value controls through ACP methods already available.

---

## 13. Windows-specific findings

| Topic | Official evidence | GUI action |
|---|---|---|
| Install | `install.ps1` first-class | Keep official installer path |
| Source build | Best-effort, untested | Don’t require |
| ACP stdin | Private handle + NUL redirect | Keep persistent pipes; no dual stdin consumers |
| Process groups | `xai-tty-utils` Job Object `KILL_ON_JOB_CLOSE`; `CREATE_NO_WINDOW` | On stop, ensure process tree death (consider Job Object or taskkill like plugin-cc) |
| Paths | `%USERPROFILE%\.grok\…` | Already defaulting to `~\.grok\bin\grok.exe` |
| Shell in plugin-cc | `shell: true` on win32 for spawnSync | GUI uses `shell: false` for ACP spawn — **prefer keep false** for arg safety |

---

## 14. Telemetry & privacy

- Product telemetry crate: `xai-grok-telemetry` (Mixpanel + product events)
- Config: `[telemetry] mode = …` (can be `disabled`) — config loader tests
- External OTEL: opt-in double switch (`GROK_EXTERNAL_OTEL` + exporters); content-free by default (`24-monitoring-usage.md`)
- Independent of SpaceXAI data-retention opt-outs

**GUI:** remains “no telemetry” of its own (PRIVACY.md). Should optionally surface CLI privacy/billing retention status via extensions (`x.ai/privacy/*`, `/privacy` parity) without implementing analytics.

---

## 15. Billing & usage

- Extension: `x.ai/billing` (`extensions/billing.rs`) — credit limit, used, period, tiers, history
- Used by pager/desktop to display credits
- Requires authentication
- Headless JSON also includes spend fields when model was reached (`14-headless-mode.md`)

GUI already polls `_x.ai/billing` and normalizes with `src/shared/billing.ts`. Keep separation: **subscription rings ≠ context signals.json**.

---

## 16. Images / uploads

- Agent advertises `embedded_context: true`
- Prompt path collects `ImageContent` and can upload (`acp_agent.rs` prompt path ~L2168+)
- Upload queue cleanup on stdio agent start (`app.rs` L299–304)
- GUI v0.4.1 paste-path fallback when ACP image capability not advertised — still valid defensive path

**Optimization:** probe agent prompt caps accurately; when image blocks are supported, send ACP image content instead of temp paths.

---

## 17. Leader architecture (why `--no-leader` matters)

Shell documents a multi-client **leader** that can multiplex stdio/WS clients (`leader/` modules). Config may default `use_leader`.

Jackie GUI launches:

```text
grok agent --no-leader stdio
```

Benefits for Electron:

- Isolated process per GUI instance
- No accidental sharing with other TUI/leader sessions
- Simpler lifecycle / kill semantics
- Matches unit-tested CLI form

Tradeoff: cannot share one backend with multiple GUIs without implementing leader-aware connection.

---

## 18. Integration options comparison (summary)

Detailed plan lives in `research/grok-build-gui-integration-plan.md`.

| Option | Verdict for Jackie product |
|---|---|
| **A. ACP stdio subprocess** (current) | **Recommended primary** — official IDE path |
| B. Headless `-p` subprocess | Secondary for one-shot / review jobs |
| C. `agent serve` WebSocket | Optional multi-window / remote later |
| D. Embed Rust crates in Electron | High cost; Windows untested build; reject for now |
| E. Fork monorepo | Trademark + maintenance burden; only for hard forks |
| F. Pure xAI HTTP API (no CLI) | Loses tools/ACP session harness; different product |

---

## 19. Security model for unofficial GUI

Must preserve:

1. Renderer sandbox + typed preload (already)
2. Never store tokens; never parse `auth.json`
3. Permission UX must not auto-click dangerous options by default
4. Official CLI install only from documented `x.ai` URLs
5. Plugin marketplace: third-party plugins execute code — warn users (marketplace README disclaimer)
6. `--always-approve` / YOLO requires explicit user consent + clear Chinese copy
7. Process tree kill on exit to avoid orphaned `grok` agents (Windows)

---

## 20. Official docs inventory (primary)

| URL | Topic |
|---|---|
| https://docs.x.ai/build/overview | Install, headless intro, custom models, API |
| https://docs.x.ai/build/cli/headless-scripting | Headless flags + **ACP example** |
| https://docs.x.ai/build/features/skills-plugins-marketplaces | Extensibility |
| https://docs.x.ai/build/modes-and-commands | Modes / slash commands |
| https://x.ai/cli | Product landing |
| https://x.ai/news/grok-build-open-source | OSS announcement |
| https://x.ai/build/changelog | Release notes (linked from README) |

Shipped user-guide (in-repo, authoritative offline):  
`crates/codegen/xai-grok-pager/docs/user-guide/01` … `24-*.md`  
especially: auth, headless, agent-mode, sessions, sandbox, permissions, usage/OTEL.

---

## 21. Compatibility notes (SDK versions)

| Component | Version / note |
|---|---|
| Official Rust ACP crate | `agent-client-protocol` **0.10.4** |
| GUI TS SDK | `@agentclientprotocol/sdk` **1.2.1** |
| Protocol | Initialize uses `ProtocolVersion::V1` |

Treat SDK bumps as a deliberate upgrade with live smoke (`work/live_acp_smoke.mjs` pattern). Extension methods and `_meta` fields are semi-stable product surface; pin tests against them.

---

## 22. What open-sourcing changes for Jackie

From https://x.ai/news/grok-build-open-source:

- Source is definitive for skills/plugins/hooks/MCP/subagents
- Local-first compile + custom inference via `config.toml` is encouraged by xAI
- Transparency of agent loop / tools / TUI

For GUI product strategy:

- **Do not compete** with official TUI on full feature parity
- **Specialize**: Windows Chinese-first control center, readable permissions, billing rings, session UX, keyboard palette
- Use OSS as **protocol oracle** when CLI behavior is ambiguous

---

## 23. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Public tree is monorepo snapshot (single commit today) | Medium | Track SHAs; re-diff on updates |
| Windows source build untested | Medium | Ship against official binaries only |
| External contribs closed | Low | Cannot upstream GUI; stay out-of-tree |
| Extension methods / `_meta` churn | Medium | Capability probes + defensive normalize |
| Trademark claims | High | Keep unofficial branding |
| Plugin third-party code execution | High | Explicit consent UI |
| Orphan agent processes on Windows | High | Harden stop/kill like plugin-cc |

---

## 24. 本 GUI 可優化發展的可能性（優先序）

> Product: Windows 中文優先、非官方 control center；已採 `grok agent --no-leader stdio` + ACP SDK 1.2.1。

### P0 — 正確性 / 穩定 / 信任

1. **Windows process tree kill**  
   Align with plugin-cc `taskkill /T /F` or Job Object so agent + children die with GUI.
2. **ACP capability-driven image path**  
   Prefer native image content blocks when agent supports them; keep paste-path fallback.
3. **`--no-auto-update` / config awareness**  
   Official docs recommend suppressing update checks in automation/ACP hosts.
4. **Set `GROK_CLIENT_VERSION`** when spawning  
   Official stdio agent logs it for diagnostics (`app.rs`).
5. **Permission UX polish (Chinese)**  
   Map option kinds (allow once / always / reject) to clear zh-TW copy; never dark-pattern YOLO.

### P1 — 官方已有、GUI 可接的能力

6. **Plan mode surface** via `session/set_mode` + plan updates in event adapter.  
7. **Richer session admin** via `x.ai/session/*` (list/rename/delete/fork/load_history).  
8. **Slash command palette** from initialize `_meta.availableCommands` + `x.ai/commands/list`.  
9. **Billing depth** — period history / on-demand from billing extension fields already defined in `billing.rs`.  
10. **Model + effort** already partially done; ensure parity with official effort IDs (`none…max`).

### P2 — 差異化 Windows 體驗

11. **中文 onboarding**：官方 install.ps1、OAuth、額度環、第一次權限教學。  
12. **專案規則可見性**：顯示 cwd 下 AGENTS.md / `.grok/config.toml` / Claude settings 是否被 `grok inspect` 發現（可呼叫 `grok inspect --json`）。  
13. **Sandbox profile picker** for headless side jobs; document interactive sandbox via CLI config.  
14. **Side-panel headless workers** (plugin-cc style review/critique) without leaving cockpit.  
15. **MCP / plugin status panel** (read-only first) from inspect + extensions — install still via official TUI or documented CLI.

### P3 — 長期 / 高成本

16. Optional `agent serve` for multi-window sharing.  
17. Leader-aware mode for power users.  
18. Local custom models UI editing `~/.grok/config.toml` (official custom models path).  
19. **Do not** embed full Rust agent into Electron without a dedicated Windows CI build story.

---

## 25. Ten final questions (evidence-backed)

### Q1. What is the official way for a third-party GUI to drive Grok Build?

**A:** Spawn `grok agent stdio` and speak ACP JSON-RPC over stdio.  
Evidence: docs.x.ai/build/cli/headless-scripting ACP section; user-guide `15-agent-mode.md`; shell `run_stdio_agent` (`app.rs` L289).

### Q2. Is Jackie’s `grok agent --no-leader stdio` valid?

**A:** Yes. CLI defines `--no-leader` on `AgentArgs` and unit-tests `agent --no-leader … stdio`.  
Evidence: `cli.rs` L262–264, L960–978; SHA `b189869…`.

### Q3. Should the GUI embed or fork the Rust crates?

**A:** Not as primary path. Windows source builds are best-effort/untested; monorepo is huge; product should stay Apache-compatible client of official binary.  
Evidence: README build hosts note; CONTRIBUTING closed; workspace size.

### Q4. How do permissions work for an ACP client?

**A:** Agent reverse-requests `session/request_permission`; client returns selected option. Rules/modes/hooks still apply server-side. YOLO via `--always-approve`.  
Evidence: `22-permissions-and-safety.md`; GUI `acp-client.ts` permission queue; shell permission resolution.

### Q5. Where do sessions live and can GUI resume them?

**A:** `~/.grok/sessions/<encoded-cwd>/<id>/`; ACP `session/load` + headless `-r`. Authoritative stream is `updates.jsonl`.  
Evidence: `17-sessions.md`; `acp_agent.rs` `load_session`.

### Q6. How does official non-ACP integration look (plugin-cc)?

**A:** Headless `grok -p` with PID/log job control; Windows `taskkill /T /F`; auth probe `grok models`.  
Evidence: plugin-cc README; `grok.mjs` `buildHeadlessArgs`; `process.mjs` terminate.

### Q7. What Windows-specific transport bug did xAI already fix that GUI relies on?

**A:** Persistent redirected stdin deadlock on Windows during ACP `session/new`; fixed by private stdin duplicate + NUL redirect.  
Evidence: `xai-acp-lib/src/stdin_reader.rs` L17–40, L81–88; SHA `b189869…`.

### Q8. How should billing/quota be fetched?

**A:** Authenticated ACP extension `x.ai/billing` (client may send `_x.ai/billing` per ACP extension convention). Do not read `auth.json`.  
Evidence: `extensions/billing.rs` L1–5, L151; GUI `getBilling()`; project AGENTS.md live validation.

### Q9. What is the license/trademark posture for an unofficial Windows GUI?

**A:** Code Apache-2.0 (read/use allowed); external contribs closed; trademarks remain xAI’s — stay clearly unofficial.  
Evidence: `LICENSE`, `CONTRIBUTING.md`, x.ai legal ToS brand clause; GUI README disclaimer.

### Q10. What official extension surfaces are most underused by the current GUI?

**A:** `x.ai/session/*` admin/history, `x.ai/commands/list`, plan mode, privacy retention, plugin/skills reload, optional headless side jobs, `GROK_CLIENT_VERSION` + `--no-auto-update`.  
Evidence: `acp_agent.rs` ext_method arms ~L3165–3425; docs headless ACP note; app.rs client version log.

---

## Appendix A — Research method

- Shallow clones of three official repos under `work/official-src/`
- `git remote -v` + `git rev-parse HEAD` recorded
- Ripgrep / file reads across shell, pager CLI, acp-lib, plugin-cc, marketplace
- Official docs.x.ai + x.ai pages fetched
- Cross-check against GUI `src/main/acp-client.ts`, `grok-cli.ts`, package.json

## Appendix B — Non-primary material

None used as sole basis for conclusions.  
ACP public site (agentclientprotocol.com) is referenced by official user-guide for protocol definition; protocol behavior conclusions above cite **xai-org code + docs.x.ai**.

---

*End of analysis. Companion files: `grok-build-official-file-map.csv`, `grok-build-gui-integration-plan.md`.*
