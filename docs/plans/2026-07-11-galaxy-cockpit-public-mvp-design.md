# Grok Build GUI v0.3.0 — public MVP adjustment

## Product position

Ship v0.3.0 as an **unofficial, Windows-first desktop control center for Grok Build**, not as a claim that Grok Build has no interface and not as a generic AI chat client.

The release has two audiences:

1. A first-time Windows user who needs one obvious next action, plain-language status, persistent work, and recoverable mistakes.
2. An experienced Grok Build user who values readable sessions, structured ACP events, model controls, billing visibility, and keyboard acceleration.

## Direction change after market review

The original C/D visual work remains useful as product identity, but it is not the moat. It must stay inexpensive, optional, and subordinate to comprehension. The public-release moat begins with successful onboarding, transparent local operation, and trustworthy packaging; deeper Doctor, process-tree, approval governance, and crash recovery belong to the next functional milestone.

### v0.3.0 scope

- C: one optional cursor layer with native text cursor, no pointer interception, shared animation loop, and reduced-motion shutdown.
- D: semantic feedback only. Send, stop, running, delete, permission, toast, and model selection each communicate state; decorative motion never blocks the operation.
- E: searchable keyboard command palette, accessible model picker, project-grouped sessions with local rename, copyable highlighted code, persisted drafts, shortcut help, and a beginner-oriented empty state.
- Release: beginner README, explicit unofficial status, privacy/security/network disclosure, checksums, and a Windows installer that does not require administrator rights.

### Deferred to v0.4+

- Environment Doctor and PATH repair
- Grok/subagent process tree, resource monitor, and safe orphan cleanup
- Rich command-risk labels and approval audit log
- Session crash/reboot recovery beyond persisted local draft/title state
- Multi-agent or multi-model workspace

## Interaction rules

- Every screen exposes one visually primary next action.
- Labels use Traditional Chinese plain language first; technical terms remain secondary.
- Effects obey both OS `prefers-reduced-motion` and the in-app disable switch.
- All custom controls retain keyboard operation, focus visibility, roles, names, and escape behavior.
- Failure messages explain what failed and what the user can do next.
- No telemetry is introduced in v0.3.0.

## Verification contract

- New behavior is developed red-green-refactor.
- Unit/UI tests cover cursor shutdown, ModelPicker keyboard control, command search/navigation, title override, draft persistence, code copy, and shortcut help.
- Full `test`, `lint`, `typecheck`, and production build must pass.
- Electron smoke covers beginner empty state, focus/deep/reduced-motion modes, command palette, and settings persistence.
- Packaging produces an NSIS x64 installer plus SHA-256 checksum and public-release documentation.
