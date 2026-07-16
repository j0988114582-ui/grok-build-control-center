# Windows Beta Testing

Use a non-critical test project. Do not test against irreplaceable work or include private project content in reports.

## Before installation

1. Download the installer and `SHA256SUMS.txt` from the same GitHub Release.
2. Run `Get-FileHash .\Grok-Build-Control-Center-Setup-*.exe -Algorithm SHA256`.
3. Continue only when the value exactly matches the published checksum.
4. Current community builds may be unsigned and trigger Windows SmartScreen.

## Test matrix

Record the app version, Windows version, architecture, and Grok CLI version.

- [ ] Install without administrator privileges.
- [ ] Detect an existing Grok CLI installation or complete the confirmed official installation flow.
- [ ] Complete browser sign-in.
- [ ] Select a disposable project folder.
- [ ] Start a session and confirm streaming output.
- [ ] Review and respond to a permission request.
- [ ] Switch model or mode.
- [ ] Confirm quota values show `—` when the service does not provide data.
- [ ] Close and reopen the app; verify expected local session titles and drafts.
- [ ] Test keyboard shortcuts and reduced-motion behavior.
- [ ] Uninstall the app.

## v0.5.x manual smoke (optional live)

These steps exercise paths that unit tests mock. Use a disposable project; prompts spend quota.

### Interject (`_x.ai/interject`)

1. Connect with a current Grok CLI, open a session, send a long prompt so a turn stays `running`.
2. Type mid-turn guidance and click **插話** (or Enter). Expect notice「已排入，下一個安全點生效」and **no** stop of the current turn.
3. Confirm the agent incorporates the interjection at a safe point (or that the status clears when the turn ends without claiming “delivered”).
4. Repeat with **立刻改做**: expect cancel then a new prompt (separate control).
5. If CLI returns method not found: expect degrade copy suggesting CLI update — never auto-cancel.

Mock coverage: `tests/app.test.tsx` (F-INT / T-INT-*), `tests/interject.test.ts`.

### Process tree kill (quit / disconnect)

1. Connect ACP (a `grok` child should appear under the app).
2. Quit the app fully (not only hide).
3. In PowerShell: `Get-Process grok -ErrorAction SilentlyContinue` — expect no orphan grok for that session (best-effort; brief races possible).
4. Optional: change Grok executable in settings while connected — expect disconnect + tree kill of the previous child.

Unit coverage: `tests/process-tree.test.ts`. Session **停止** is ACP `session/cancel` only — it must **not** kill the process tree.

### Local next-turn queue (0.5.1)

1. While a turn is running, type text and click **排隊下一輪**.
2. When the turn completes, expect an automatic `session/prompt` with that text (status「下一輪已排隊」clears).

## Reporting

Use the **Windows beta feedback** form for a complete test pass and the **Bug report** form for reproducible defects.

Before uploading evidence, remove:

- tokens, auth files, account names, and email addresses;
- prompts, transcripts, and private source code;
- project paths that reveal personal information;
- generated installers and debug files containing secrets.

Security vulnerabilities must be reported privately through GitHub Security Advisories, not public Issues.
