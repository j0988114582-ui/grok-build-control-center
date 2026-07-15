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

## Reporting

Use the **Windows beta feedback** form for a complete test pass and the **Bug report** form for reproducible defects.

Before uploading evidence, remove:

- tokens, auth files, account names, and email addresses;
- prompts, transcripts, and private source code;
- project paths that reveal personal information;
- generated installers and debug files containing secrets.

Security vulnerabilities must be reported privately through GitHub Security Advisories, not public Issues.
