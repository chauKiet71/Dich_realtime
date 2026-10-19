# Gemini Flash + WaveNet — verification 2026-10-19

Scope derived from the user request: preserve speech meaning while combining light
normalization and translation in one Gemini call; synthesize vi/zh/en using WaveNet.
OpenAI remains the STT provider. No production deployment or secret upload.

## TDD evidence

- `1b2490d`: RED — `node --test test/pipeline.test.js` failed because the new
  pipeline module did not exist. `049044e`: same target GREEN, 6 tests.
- `165081f`: RED — hybrid HTTP health lacked engine selection and room audio
  never entered the new pipeline. `1e1d428`: both integration tests GREEN.
- `9ab4177`: RED — utterance module absent. `7a6ccfe`: both buffering tests GREEN,
  client wired to bounded capture and playback.

| Guarantee | Evidence |
|---|---|
| One translation call, correct target WaveNet for four directions | test/pipeline.test.js |
| No guessing across an invalid language pair; reject truncated JSON | test/pipeline.test.js |
| Input/output limits, concurrency/quotas, sanitized errors, cancellation | pipeline and room-call tests |
| 700ms silence, 300ms preroll, 30-second utterance cap | test/utterance.test.js |
| Only listener receives room audio; playback ack releases next turn | test/room-call.test.js |
| Real browser worklet capture, muted playback, mic release, stop | scripts/hybrid-browser-smoke.mjs |

## Automated checks

- `npm run test:coverage`: **66/66 pass**, line 92.47%, branch 88.72%, functions
  81.65% of Node-instrumented modules. Pipeline line coverage 98.97%.
  Browser app.js/UI are not included in this Node coverage denominator.
- `npm run check`: PASS. Build/TypeScript/linter steps do not exist in this buildless app.
- `npm audit --omit=dev`: zero reported vulnerabilities.
- `git diff --check`: PASS.
- `node scripts/hybrid-browser-smoke.mjs`, with `PLAYWRIGHT_MODULE` pointing at
  bundled Playwright: PASS on headless Chrome, 390×844 viewport, fake microphone
  and mocked pipeline. Silence-to-request measured 696ms. All recorded audio
  playback starts had microphone disabled. No page errors.

## Real provider smoke

Used Google-generated synthetic input, then the complete configured pipeline.
No human microphone recording. Each request used the existing supplied local
key files; no key values or provider error bodies were logged.

| Direction | Example outcome | Complete audio response latency |
|---|---|---|
| vi → zh | Two tickets to Hanoi tomorrow → 我想买两张明天去河内的票。 | 6818ms |
| zh → vi | 我明天不去机场。 → Ngày mai tôi không đi sân bay. | 4745ms |
| en → vi | Two tickets tomorrow → Tôi muốn mua hai vé cho ngày mai. | 4802ms |
| vi → en | Not fifteen tickets, only two → I don't want to buy fifteen tickets, just two. | 5195ms |

Latency excludes input fixture generation and the 700ms silence boundary.
These four samples are smoke checks, not a quality benchmark or speed guarantee.
Model: `gemini/gemini-3-flash-preview`; STT: `gpt-4o-mini-transcribe`.
TTS voices: `vi-VN-Wavenet-A`, `cmn-CN-Wavenet-A`, `en-US-Wavenet-D`.

## Security and limits

Keys are server-side only; local config stores paths, production uses env secrets.
New endpoint retains Basic authentication, Host/Origin checks, required custom
header, content-type checks, bounded PCM and provider output, timeout and abort.
Provider redirects are rejected. User text rendered with textContent.
No new dependency. No audio persisted by the application. Provider data policies
still apply; UI discloses OpenAI, 9Router and Google processing.

Local configured preview runs at http://localhost:3002 (health: hybrid/configured).
Existing 3000/3001 processes were not stopped. Restart `npm start` to load the
updated `.env.local` on its normal port. Railway has not been changed.

Remaining manual validation: physical mic/room noise, perceived voice quality,
real two-device network conditions, Safari/iOS autoplay. Room transport and
cancel/ack behavior have automated integration coverage with fake providers.
