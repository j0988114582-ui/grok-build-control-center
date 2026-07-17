# v0.8.0 plan review — Codex GPT-5.6 full access

Review date: 2026-07-17  
Authoritative input: `docs/plans/2026-07-17-v0.8.0-ux-session-remote-plan.md`  
Code baseline inspected: v0.7.0 at `511e0e7`  
Scope of this review: plan and feasibility only; no product code was changed.

## 1. Verdict: Request-changes

The desktop UX/session work is coherent and feasible against 0.7.0. The Remote direction has a sound base — loopback-only origin, outbound tunnel, remote-off by default, short-lived pairing, app-level authorization, method allowlist, revocation, and an obvious desktop kill switch — but it is **not yet adequate for a 4G/public URL**.

The blocking issues are not “more crypto.” They are missing trust-boundary contracts:

- a remote prompt can still cause arbitrary tool execution, and the plan does not forbid Remote while desktop YOLO is active;
- authentication is left as alternatives (`Bearer` *or* cookie; one of several CSRF schemes), with no exact Host/Origin/CSP/cache contract;
- `permission.respond` is method-allowlisted but not object-authorized to one live request/session/option;
- Cloudflare Quick Tunnel is positioned as the consumer default even though Cloudflare explicitly calls it testing/development-only, with no SLA and no SSE;
- the privacy copy incorrectly implies that the tunnel provider sees only metadata. Cloudflare terminates visitor TLS at its edge, so it is in the data path and can technically process plaintext HTTP content before forwarding it through the tunnel;
- the current code has renderer-owned focus/transcript state but main-process readiness and permission state. The plan needs an authoritative main-process Remote broker before exposing these actions.

After the must-edits below, the design can be adequate for a **single trusted operator, short-lived, explicitly enabled remote session**. For routine/repeated use, a named tunnel protected by Cloudflare Access is the defensible recommendation; the app's own auth remains mandatory.

Cloudflare facts used in this assessment:

- [Quick Tunnels are for testing/development, have no SLA, cap 200 in-flight requests, and do not support SSE](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
- [Cloudflare sits between visitor and origin, with separate visitor-edge and edge-origin protection](https://developers.cloudflare.com/ssl/); therefore the plan must not describe the provider as metadata-only.
- [Cloudflare recommends validating the Access JWT assertion at the origin](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
- [Cloudflared debug logs can include URLs, methods, and headers](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/), which matters because the pairing secret and cookies are credentials.

## 2. P0 / P1 / P2 on the plan

### P0 — must resolve before GO

1. **Remote + YOLO is an uncontained remote-code-execution path** (§8.3, R-SEC-12, R-SEC-14).
   - Trigger: desktop is in `always-approve`; a stolen Remote session sends a prompt asking Grok to run shell or edit files.
   - Consequence: forbidding a Remote “YOLO toggle” does not help; the already-active desktop mode silently approves the agent's tools.
   - Smallest fix: Remote must refuse to start while YOLO is active; enabling YOLO while Remote is active must be rejected (preferred) or first revoke all Remote sessions and stop the tunnel. Remote must operate only with the existing `ask` mode. The current code already keeps `agentPermissionMode` in main and resets it to `ask` on launch, so this is enforceable at the authoritative boundary.

2. **Authentication/CSRF is a menu, not a protocol** (R-SEC-1–8).
   - Trigger: implementation chooses bearer storage in JavaScript, permissive CORS, or SameSite without exact Origin/Host validation; a malicious site can also target the loopback server directly.
   - Consequence: token theft, CSRF, DNS-rebinding/Host-header exposure, or inconsistent mobile behavior.
   - Smallest fix: lock one contract: opaque random session token; only its hash held in process memory; `Set-Cookie` as a host-only `HttpOnly; Secure; SameSite=Strict; Path=/api` cookie; no token in response JSON or browser storage; exact expected `Host` and `Origin` checks; no CORS; required `Content-Type: application/json` and `X-Grok-Remote` on mutations; `Cache-Control: no-store`. Add a static-app CSP (`default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.

3. **The pairing URL fragment flow is incomplete** (R-SEC-1–3).
   - Trigger: `#/pair?t=...` is opened; URL fragments are not sent in HTTP requests.
   - Consequence: an implementer may move the secret into a query parameter (where it reaches access logs/history/referers) or pairing simply fails.
   - Smallest fix: specify that the local SPA reads the fragment, immediately removes it with `history.replaceState`, and POSTs it once in the JSON body to `/api/pair`; it is never placed in query strings, logs, analytics, DOM text, or referrers. Pair responses set only the HttpOnly cookie.

4. **Method allowlisting does not provide object-level authorization** (R-SEC-11, R-SEC-14).
   - Trigger: a client supplies another `sessionId`, a stale/guessed `requestId`, or an `optionId` from another permission.
   - Consequence: cross-session prompts/cancels or approval of the wrong action. Remote approval can authorize shell/file operations even though Remote has no direct shell API.
   - Smallest fix: keep selected session server-side; prompt/cancel never trust a client session id; require that it is loaded and ready in the current ACP generation. `permission.respond` must match one server-held pending tuple `{requestId, sessionId, allowedOptionIds, expiresAt}`, be single-use, and be atomically consumed. It must show the exact action needed for an informed decision, while redacting unrelated raw input. Disconnect/load/cancel/timeout clears pending permissions.

5. **Quick Tunnel is the wrong unqualified default for a released consumer security feature** (§8.2, §8.8).
   - Trigger: a normal user treats the one-click default as the supported production path.
   - Consequence: the product depends on a service Cloudflare labels testing/development-only and no-SLA; outages/limits become product failures, and an SSE-based implementation would not work.
   - Smallest fix: label Quick Tunnel **Experimental / temporary session** and require an every-start risk/terms confirmation, not merely a first-ever confirmation. Recommend named Tunnel + Access for repeated use. If the station owner insists on Quick as the one-click entry, the UI and DoD must say beta/best-effort and must not claim production reliability. Use bounded polling, not SSE.

6. **The privacy statement is materially wrong** (§8.6, §8.8).
   - Trigger: a user sends prompts/transcript/permission details through the tunnel believing Cloudflare sees only SNI/traffic shape.
   - Consequence: uninformed disclosure of source code, prompts, and tool decisions to a third-party processor.
   - Smallest fix: state that TLS protects the phone-to-Cloudflare and cloudflared transport links, but Cloudflare terminates edge TLS and is technically able to process HTTP content. Custom/ngrok providers have the same trust class unless application-level end-to-end encryption is added (not proposed here).

### P1 — important plan corrections

1. **Add a main-process Remote broker** (§6, §8.5).
   - Today, focus and transcript arrays live in `App.tsx`; readiness is enforced by `SessionReadyGate` in main; pending permission options are held by `GrokAcpClient`. A new HTTP server cannot safely call renderer state or duplicate these rules.
   - Plan `remote-controller.ts` as the single authority for selected session, bounded/redacted event tail, pending permissions, running state, readiness generation, and all Remote mutations. The renderer subscribes to it; the HTTP layer never calls ACP or Electron IPC handlers ad hoc.

2. **Data minimization is underspecified** (R-SEC-9, `sessions.list`, `transcript.tail`).
   - Session titles, cwd, transcript, tool output, and permission details can all contain secrets; “no directory-list API” is insufficient.
   - Define response DTOs: session list omits cwd by default; transcript tail excludes thoughts, raw tool input, full tool output, images, and arbitrary file contents; cap item count and bytes; HTML-escape/render as text; no Markdown HTML. Permission cards include only the minimum exact action required to decide. Document that prompts/transcript transit the tunnel provider.

3. **Replace persistent six-digit PIN and weak lockout semantics** (R-SEC-5).
   - Generate a fresh 6–8 digit PIN for each Remote activation, display it only on desktop, keep only a salted slow hash in memory, and never store the plaintext in `electron-store`. Expire it with the pairing secret. Count failures globally per pairing generation and per effective client, not only by IP; five failures invalidate the pairing secret and require a desktop click to issue another. Use generic errors and constant-time comparisons. Do not auto-regenerate an indefinitely pairable QR after expiry.

4. **Make token lifetime and revocation exact** (R-SEC-3–6).
   - Choose opaque tokens, not “opaque or JWT.” Use an idle timeout (suggested 30 minutes) plus an absolute maximum (4 hours), memory-only hashes, atomic revoke, and restart/Remote-stop invalidation. Successful pairing disables further pairing when the one-device default is active. Do not treat User-Agent hashing as meaningful theft protection; it is spoofable and can break after browser updates.

5. **Add lifecycle fail-closed behavior** (R-SEC-0c).
   - Stop/revoke on app quit, Remote off, tunnel child exit, origin-server error, executable change, logout/reauth, and permission-mode transition. Bind an OS-assigned loopback port for Quick Tunnel; parse and validate exactly one `https://*.trycloudflare.com` URL; do not show QR until a nonce health check proves that URL routes to this process. Kill the Windows process tree. Ensure no orphan tunnel can remain advertised after the origin closes.

6. **Constrain named/custom modes** (§8.2).
   - A remotely managed named tunnel needs a stable origin port/config; the current plan does not say how its configured localhost URL tracks an ephemeral app port.
   - For 0.8.0, either (a) document user-managed named Tunnel + Access with a reserved loopback-only port and explicit collision failure, or (b) defer in-app named-token management. If Access is claimed, validate `Cf-Access-Jwt-Assertion` issuer/audience/signature and still require app pairing/session auth. Never put a tunnel token on the command line or in plaintext settings/logs; use OS-protected storage and a restricted token file if app management remains in scope.
   - “Custom public base URL” must be `https`, exact-origin pinned, and pass a nonce route-proof before QR display. Otherwise defer it; accepting an arbitrary URL is not a tunnel integration.

7. **Strengthen supply-chain requirements** (R-SEC-20).
   - Pin an exact supported `cloudflared` version and SHA-256 in the release, download to a private temp path, verify before rename/execute, reject redirects outside an allowlist, use `execFile`/`spawn` without a shell, disable child auto-update for the bundled copy, and include license/terms disclosure. Cloudflare publishes per-release checksums on its [official GitHub releases](https://github.com/cloudflare/cloudflared/releases). An override executable needs an explicit unverified warning or publisher/hash check.

8. **Fix rate-limit defaults and proxy-IP trust** (R-SEC-10).
   - `30/min prompt` is much too high for a high-impact action, while `60/min read` conflicts with several independently polled endpoints. Prefer one `/api/snapshot` poll every 2–3 seconds with backoff; prompt about 5/min and one in flight per session; permission responses bounded by live pending requests. Add global + per-session + per-token + pairing-generation limits. Trust `CF-Connecting-IP` only in the validated cloudflared mode; never let a direct loopback caller select an arbitrary client IP through headers.

9. **Expand the security test gate** (§8.7, §9, §10).
   - Add wrong Host/Origin, malicious CORS preflight, direct-loopback CSRF, fragment/query/log leakage, cookie attributes, XSS payload rendering, stale/cross-session permission IDs, replay/double-submit, Remote+YOLO mutual exclusion, tunnel death, app quit, token restart invalidation, body-size/JSON-depth limits, slow request/header timeouts, and custom/named route-proof tests.
   - A true phone-on-4G test is a release gate when Remote ships. “CI may skip live tunnel” is fine for CI, but cannot replace the release-candidate manual test. Record provider, phone/browser, network, start/kill/reconnect, and negative auth results.

10. **Narrow the release mechanics even if the marketing version stays 0.8.0** (§7, §11).
    - Desktop UX/session hygiene plus a new public control plane, mobile SPA, tunnel binary lifecycle, named/custom modes, and a security review is too broad for one strictly serial pass with no independent rollback.
    - Keep one public 0.8.0 only if Remote is behind a default-off feature gate and has its own internal milestone/GO. For 0.8.0, support one tunnel path well; document named+Access rather than implementing named-token and arbitrary-provider management. If the Remote gate misses, desktop UX should be releasable without dormant/unreviewed Remote code.

11. **Make the gray-text gate quantitative and surface-aware** (§4, §9).
    - The likely current bug is real: base `.event-head` uses dark `#4c4b43` for the paper transcript but the same card is reused inside the dark Team pane. The plan's blanket “use `--ink`” is also unsafe because `--ink` is a paper-surface dark token.
    - Introduce separate semantic text tokens for paper, dark panel, muted metadata, and status. Require WCAG AA contrast (4.5:1 normal text, 3:1 large text/UI boundaries) after alpha compositing. Screenshot/axe matrix: dark/light × focus/deep × main/Team × expanded/collapsed × pending/in-progress/completed/error, including long Windows paths. Axe alone is insufficient because collapsed/virtualized cards may not be audited.

12. **Resolve drag/drop semantics before implementation** (§1.1, §6).
    - “Every dropped file becomes an absolute path” conflicts with “supported images stay image blocks.” Pick one contract. Recommended: every local file/folder drop inserts its absolute path exactly once; supported images may additionally become image attachments only if the UI clearly shows both and avoids duplicate model input. Otherwise keep the current chooser behavior and say images are attachments instead of path lines.
    - Preview drag applies only to `source.type === 'file'`; remote images and inline code have no local path. Internal Preview→composer drag uses `DataTransfer`, not Electron `startDrag`; native `startDrag` is only needed for dragging a file out to Explorer. Explorer→sandboxed renderer needs a narrowly exposed `webUtils.getPathForFile` bridge plus main-process `stat`, and folders are inserted, never recursively enumerated. Define multi-chip behavior; the current `pastePathChip` is singular.

13. **Composer auto-size must resize the containing layout, not only textarea** (§5).
    - Main `.composer` is currently fixed at 88px and Team textarea still has `resize: vertical`. Specify `ResizeObserver`/layout recalculation, `resize:none`, the container cap including the running command rail, transcript minimum height, and reset behavior. Test at the minimum 1040×680 window and with 2/3 Team panes.

14. **Define permission display versus redaction** (R-SEC-9, R-SEC-14).
    - A user cannot safely approve an opaque “tool wants permission,” but raw tool input may contain secrets. Specify a typed summary: tool title, operation class, target basename/shortened path or command summary, risk label, exact ACP options, expiry; a desktop-only “view full details” may hold the rest. Remote approval should be a separate activation toggle, default off, even though it is an MVP capability.

### P2 — non-blocking clarity/nits

1. Remove R-SEC-6's User-Agent binding or label it telemetry/anomaly detection only; it is not a possession factor.
2. State that Quick mode uses polling because SSE is unsupported. Combine status/transcript/permission into one bounded snapshot to reduce load and race windows.
3. Clarify Esc order as: lightbox → existing modal/drawer/search/select overlays → clear active Preview item → cancel turn. Closing an item clears active/load state but does not delete the file or remove it from recent history.
4. Define `suggested-cleanup` for missing/invalid `messageCount`: fail safe to “not empty.” State explicitly that the 10-day `active` rule takes precedence over the “keep latest five” suggestion.
5. Add mobile accessibility/responsiveness gates: current iOS Safari and Android Chrome, 320 CSS px width, focus visibility, 44px targets, screen-reader names, no clipboard dependency.
6. Do not log tunnel stdout/stderr at debug level in production. Redact public URL, pairing material, cookies, PIN, tunnel token, request bodies, and `Authorization` everywhere, including crash reports.

## 3. Must-edit list (concrete patches to the plan)

- **§0 / §1.6:** replace “預設 Cloudflare Quick Tunnel” with “Quick Tunnel 為每次明確啟用的 Experimental／best-effort 路徑；重複使用推薦 user-managed named Tunnel + Access；Remote 總開關仍預設關.”
- **§2:** add `X8`: “Remote 與 YOLO 不可同時啟用；Remote 不繼承桌面自動核准.” Add `X9`: “0.8.0 不管理任意第三方 tunnel command/token unless route proof and secret-storage requirements are met.”
- **§6 / §8.5:** add `remote-controller.ts` as the only Remote-to-ACP broker; it owns selected session, readiness checks, event tail, pending permission tuples, running state, provenance marking, and atomic mutation serialization.
- **§7:** split wave 5 into security contract → local broker/server → mobile SPA → Quick tunnel lifecycle → 4G negative test. Put a separate Remote GO before packaging. Allow desktop-only 0.8.0 packaging if Remote gate fails, rather than shipping dormant unreviewed public-server code.
- **§8.2:** describe the Quick/named table as tradeoffs, not equivalent providers. Add Quick's official dev/test-only, no-SLA, 200 in-flight, no-SSE limits. For named mode define stable loopback port/config ownership and make Access recommended; cut arbitrary base URL from MVP or require HTTPS origin pinning + nonce route proof.
- **R-SEC-0:** add exact Host/Origin allowlist, no CORS, request/header/body/time limits, and fail-closed lifecycle events. QR is not shown until the HTTPS URL passes a nonce health check to this process.
- **R-SEC-1–3:** specify fragment → `history.replaceState` → JSON POST pairing flow. Use opaque session tokens only; store hashes in memory; issue only a host-only HttpOnly/Secure/SameSite=Strict cookie; never expose credentials to JavaScript storage or URLs.
- **R-SEC-2:** replace automatic perpetual QR rotation with “expiry closes pairing; desktop action regenerates.” Successful single-device pairing closes pairing immediately.
- **R-SEC-4:** add 30-minute idle + 4-hour absolute TTL and revoke on restart, Remote off, tunnel/server failure, logout/reauth, and permission-mode change.
- **R-SEC-5:** replace persisted PIN with per-activation generated PIN held as a salted slow hash in memory; five failures invalidate that pairing generation. Add global/pairing limits so IP rotation cannot bypass lockout.
- **R-SEC-6:** remove User-Agent binding as a security control. Keep one active device default and explicit revocation; optionally record coarse UA only for display.
- **R-SEC-7–8:** delete the `Bearer or cookie` and `CSRF A or B` alternatives; insert the exact cookie/Origin/Host/custom-header/no-CORS contract above plus CSP, no-store, no-referrer, nosniff, and frame denial.
- **R-SEC-9:** replace “no sensitive path list” with explicit DTO redaction/byte caps for sessions, transcript, tools, and permissions. Acknowledge that permitted transcript/prompt content transits the provider.
- **R-SEC-10:** use combined snapshot polling with backoff; lower prompt rate; add global/session/token/pairing-generation caps and one in-flight prompt per session.
- **R-SEC-11–14:** add server-side focus/readiness checks; never accept a prompt/cancel session id from the client; bind permission response to one unexpired pending request/session/option and consume once. Add Remote↔YOLO mutual exclusion and a separate default-off “allow permission approval from phone” activation toggle.
- **R-SEC-15–19:** require banner state to distinguish “server starting / URL verified / pairable / paired / tunnel failed.” Logs are structured, bounded, redacted, and production cloudflared log level is not debug.
- **R-SEC-17 / §8.6:** make Quick confirmation every activation and include Cloudflare terms/provider processing, not first-use only.
- **R-SEC-20:** pin version+hash, verify before execution, disable bundled child auto-update, avoid shell invocation, protect any named token with OS storage/token file, and add license/notices.
- **§8.6 / §8.8:** replace “供應商只見 SNI／流量模式，HTTPS 內容仍在 TLS 內” with accurate edge-termination wording: link encryption exists, but the provider is a trusted data processor technically able to handle HTTP content.
- **§8.7 / §9 / §10:** add the negative-test matrix in P1-9 and require a recorded real 4G release-candidate test; CI live-tunnel skip is not the release waiver.
- **§4 / §9:** replace subjective “不可整塊死灰” as the gate with semantic surface tokens + the contrast ratios and screenshot matrix in P1-11.
- **§1.1:** state the image/path duplication rule, local-file-only Preview drag rule, internal `DataTransfer` versus native `startDrag`, secure `webUtils.getPathForFile` bridge, directory no-recursion rule, and multi-chip behavior.
- **P-CLOSE-2:** preserve current overlay precedence before clearing Preview; explicitly say close is not delete/remove-from-history.
- **§3:** define unknown message counts and the precedence between 10-day active and keep-latest-five.
- **§5:** cap the whole composer layout, define `ResizeObserver`, `resize:none`, transcript minimum, command-rail behavior, and minimum-window/Team tests.

## 4. GO recommendation: yes-after-edits

Do **not** GO on the current plan text. GO after every P0 is patched into the authoritative plan and the P1 security contract/broker/test changes are accepted.

The remote recommendation is:

- **Quick Tunnel:** good zero-account evaluation UX for an explicitly experimental, short-lived session; random URL is not authentication; no SLA; no SSE; every-start disclosure required.
- **Named Tunnel + Access:** better for a stable, repeated-use setup because it adds an identity gate and policy controls, but it requires a Cloudflare account, domain/configuration, secure tunnel-token handling, a stable localhost route, and Access JWT validation. It is not a one-click consumer default.
- **App auth remains required in both modes.** Access is defense in depth, not a replacement for pairing, Remote session authorization, object-level ACL, or the kill switch.

One public 0.8.0 is possible only with a default-off Remote feature gate, one well-defined tunnel path, a separate security GO, and the option to omit Remote if its gate fails. Implementing Quick + managed named token + Access + arbitrary providers in the same release is over-scoped.

## 5. 給站主

桌面 UX、Session 清理、灰字與輸入框這一批可以做；真正要先改的是手機外網遙控的安全契約。目前的多層方向是對的，但還不能把公開網址當成已安全：Remote 必須和 YOLO 互斥、權限核准要綁定當下那一筆請求、cookie／Origin／Host／CSP 要寫死，且要誠實說明 Cloudflare 會終止 TLS、Quick Tunnel 官方只定位為測試用途。把上述 P0/P1 寫回計畫、做完真 4G 負面測試後，我建議 GO；長期常用則以 named Tunnel + Access 為推薦路徑。
