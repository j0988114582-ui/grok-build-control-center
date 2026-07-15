# Roadmap

This roadmap records real release and maintenance work. It is not a promise of dates or unsupported capabilities.

## Release trust

- [ ] Sign Windows installers with a trusted code-signing certificate.
- [ ] Automate release packaging, SHA-256 generation, and artifact verification.
- [ ] Publish a software bill of materials and dependency notices with releases.
- [ ] Document repeatable Defender and malware-scanning checks for release artifacts.

## Compatibility and reliability

- [ ] Validate clean installation on supported Windows 10 and Windows 11 environments.
- [ ] Maintain a compatibility matrix for Grok CLI versions.
- [ ] Improve privacy-safe diagnostic export for startup, session, and shutdown failures.
- [ ] Add regression coverage for account switching, permission prompts, IME input, shutdown, and persisted drafts.

## Community beta

- [ ] Recruit an initial set of independent Windows testers.
- [ ] Record successful and failed test paths through the beta feedback form.
- [ ] Publish at least one release driven by external issue feedback.
- [ ] Track release asset downloads without treating downloads as active users.

## Documentation and accessibility

- [ ] Add verified application screenshots and a short real-product demo GIF.
- [ ] Keep Traditional Chinese and English setup instructions aligned.
- [ ] Expand keyboard, screen-reader, reduced-motion, and high-contrast testing.

## Not in scope

- Storing Grok account tokens.
- Replacing Grok's official authentication.
- Simulating unsupported terminal operations.
- Becoming a full IDE or multi-provider credential vault.
