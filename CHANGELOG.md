# Changelog

All notable user-visible changes to Grok Build Control Center are documented here.

The format follows Keep a Changelog principles and the project uses semantic versioning where practical.

## [Unreleased]

### Added

- GitHub Actions quality checks and Windows UI smoke evidence.
- Structured bug, feature, and beta feedback forms.
- Pull request validation and risk-review checklist.
- Public roadmap, beta testing guide, support guidance, and release metrics script.

## [0.4.0] - 2026-07-16

### Added

- Global pinned sessions group at the top of the sidebar (local preference only).
- Multi-select batch delete with per-item success/failure summary (`grok sessions delete`).
- Runtime tool-permission mode control: ask every time (default) or always-approve (YOLO) via `grok agent --always-approve`.
- Sidebar toggle shortcut (`Ctrl+B` by default) and a collapsed rail expand control that works on the home empty state.
- Automatic cleanup of orphan local titles, drafts, and pins when sessions disappear or are deleted.

### Changed

- Project group titles are larger and clearer; session titles are visually secondary.
- Composer height is fixed with internal scrolling so long drafts no longer steal transcript space.
- YOLO mode always starts as “ask every time” on each app launch (not persisted) and requires a confirmation dialog plus a persistent warning banner.

### Fixed

- Collapsing the sidebar on the home screen left no way to reopen it.

## [0.3.2] - 2026-07-12

### Added

- Traditional Chinese-first README with an English appendix.
- Weekly quota summaries for Total, Build, Imagine, and API without fabricating unavailable values.
- Confirmed first-time Grok CLI installation flow using xAI's documented Windows installer source.
- Browser-based account reauthentication, project-grouped sessions, search, Markdown export, persistent drafts, command palette, model picker, and accessibility controls.

### Changed

- Clarified unsigned community-build status, checksum verification, privacy boundaries, and reproducible build instructions.

### Fixed

- Release audit issues involving cached capability truthfulness, fixture privacy, accessibility contrast, IME behavior, shutdown robustness, and CLI startup handling.

## [0.3.1] - 2026-07-12

### Fixed

- Hardened CLI startup, shortcut settings, Escape-key priority, shutdown behavior, and other release-gate defects.

## [0.3.0] - 2026-07-11

### Added

- Initial public Windows desktop GUI for Grok Build CLI.
- ACP-native sessions, streaming messages, tool cards, permission confirmation, modes, models, local session indexing, Electron packaging, automated tests, and UI smoke coverage.

[Unreleased]: https://github.com/j0988114582-ui/grok-build-control-center/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.4.0
[0.3.2]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.2
[0.3.1]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.1
[0.3.0]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.0
