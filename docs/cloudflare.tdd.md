# Cloudflare speech and translation verification — 2026-10-26

## Scope and journeys

Derived from the user's request to run both recognition and translation on Cloudflare.
Keep Google WaveNet playback, both one-device language pairs, room language hints,
authentication, cancellation and request quotas. Preserve legacy provider opt-in.

## TDD evidence

| Stage | Evidence | Result |
| --- | --- | --- |
| Initial RED | `node --test test/cloudflare.test.js`; checkpoint `c632f25` | 9 executed tests failed: Cloudflare selected the legacy credentials, and HTTP readiness returned 503. |
| Initial GREEN | `node --test test/cloudflare.test.js test/pipeline.test.js`; checkpoint `a2f636a` | 26/26 passed. |
| Credential-file RED | `node --test --test-name-pattern="Cloudflare accepts labeled" test/cloudflare.test.js`; checkpoint `ba2af0a` | 1 executed test failed for the user's account/token text-file format. No real token in fixtures. |
| Credential-file GREEN | `node --test test/cloudflare.test.js test/pipeline.test.js`; checkpoint `0900809` | 27/27 passed, including rejecting duplicate token fields. |
| Full verification | `npm.cmd run check`; `npm.cmd run test:coverage` | Syntax PASS; 85/85 tests PASS, no skipped/cancelled tests. |

## Guarantees

| Guarantee | Evidence |
| --- | --- |
| Recognition and translation both call the configured Cloudflare account; no OpenAI key load or OpenRouter fallback | `test/cloudflare.test.js` checks all four one-device language directions and exact request hosts/bodies. |
| Whisper receives the original WAV in base64 with `task=transcribe`, with room source-language hints only when provided | Cloudflare request assertions. |
| Translation remains bounded JSON; invalid output, wrong language direction and truncated completions stop before TTS | Cloudflare output validation tests plus legacy pipeline tests. |
| Secrets stay server-side; invalid account/model paths and duplicate token fields fail before sending data | Credentials tests, HTTP health assertions and manual diff/security review. |
| 429 retries only the failed stage; cancellation prevents later requests | Cloudflare STT/translation throttling and abort tests. |
| HTTP and room lifecycle retain admission checks, audio validation and playback ownership | Existing server, Railway and room regression suites. |
| UI reports Cloudflare as the actual recipient, playback/microphone isolation remains functional | `scripts/hybrid-browser-smoke.mjs`, run with bundled Playwright. PASS, including mobile layout, synthetic microphone capture, 706 ms silence commit, playback and cleanup. Providers mocked. |

Coverage of files loaded by the Node suite: **92.94% lines, 90.56% branches,
81.25% functions**. `lib/pipeline.js`: 99.35% lines, 96.15% branches.
The Node report does not include `public/ui.js`/`public/app.js`; the browser smoke
exercises these separately. Physical microphone/device audio and production
round-trip latency are not benchmarked by the automated suite.

## Live provider check

Ran `node --env-file=.env.local artifacts/verify-cloudflare-live.mjs --confirm-provider-calls`.
The ignored script generates known synthetic sentences through Google TTS in memory;
it does not read or upload previously recorded user audio, persist audio, or print keys.

All three directions completed Cloudflare Whisper → Cloudflare Qwen3 → Google TTS
with HTTP 200 at each stage:

- vi → zh: “Tôi không muốn mua 15 vé, chỉ 2 vé thôi.” → “我不想买15张票，只买2张。”
- zh → vi: “我明天不去机场 只去火车站” → “Tôi sẽ không đến sân bay ngày mai, chỉ đến ga tàu”.
- vi → en: “Ngày mai tôi muốn mua hai vé đi Hà Nội.” → “Tomorrow I want to buy two tickets to Hanoi.”

Observed STT HTTP calls: 1.754–5.512 s; translation: 0.493–0.657 s;
output TTS: 0.352–0.534 s. These are three synthetic samples, not a latency SLA
or a broad translation-quality evaluation. English → Vietnamese is covered by
the mocked suite but was not called against live providers in this run.

The initially supplied account returned 429 / code 4006 (daily free allocation
exhausted). The user's replacement credential file succeeded. Only the path and
Account ID are stored in ignored local configuration; the token is read from
the external file and is not copied into source or `.env.local`.

## Deployment state

Local configuration selects Cloudflare. Railway CLI's prior session expired;
the new CLI login is waiting for user activation. This report does not claim
Railway has been migrated. `.env*` and `artifacts/` remain excluded from upload;
Docker uses an allowlist for application source. No dependencies were added.
