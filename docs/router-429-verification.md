# Bounded 9Router 429 retry — 2026-10-19

User request: wait/retry on 429 without immediately ending the session; deploy Railway.

TDD: `3896472` records RED (3 failures: no retry, 502 instead of 429, room closed).
`baa7386` records GREEN for the same tests. Additional tests cover HTTP-date
Retry-After, total wait budget and cancellation with the real timer.

Behavior: only 9Router chat completions retry, at most twice. Honor Retry-After
(seconds/date); fallback 2s/4s; minimum 1s; total wait at most 20s within existing
90s pipeline deadline. If header exceeds remaining budget, return 429 rather
than retry early. STT runs once; TTS runs only after successful translation.
Provider bodies remain private. Exhaustion returns safe code ROUTER_RATE_LIMITED
and the current transcription. No secret/configuration changes.

Single-device UI keeps the session/micro track alive but muted, shows a clear
failure instead of stale progress, and offers Nói lại. No unbounded auto-resubmit.
Back navigation explicitly stops the session rather than triggering the resume
button. Room sessions return to ready and preserve both WebSocket connections.

Verification:
- npm run test:coverage: 73/73 pass; lines 92.64%, branches 89.27%, functions 81.25%.
  Node coverage excludes browser app.js; pipeline line coverage 99.16%.
- npm run check: PASS; no build/TypeScript/lint stages in this project.
- Chrome hybrid-browser-smoke.mjs with and without --429: PASS. Mocked providers,
  real worklet with synthetic mic; verified live-muted track on 429, resume on
  same track, successful subsequent translation and navigation cleanup.
- git diff --check: PASS. No new dependency, no keys added, auth unchanged.

Live provider quota may persist after retries. This release handles that failure;
it does not increase the provider's quota or guarantee successful translation.
