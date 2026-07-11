# Contributing

Small, focused pull requests are easiest to review.

1. Open an issue describing the user-visible problem or proposed behavior.
2. Add or update a test that fails for the expected reason.
3. Implement the smallest change that makes it pass.
4. Run `npm run verify`.
5. For visual changes, run `npm run smoke:ui` and describe the affected states.

Do not commit local screenshots, transcripts, auth files, debug logs, generated installers, or secrets. Keep user-facing text understandable to someone who has never used a terminal.
