# OpenRouter migration — 2026-10-19

User requested DeepSeek through OpenRouter, replacing 9Router. Existing OpenAI
STT, Google WaveNet, 700ms gate and bounded/cancellable 429 retry remain.

Selection: `deepseek/deepseek-v3.2`, non-thinking (`reasoning.enabled=false`),
JSON output. OpenRouter `/api/v1/models` confirmed the model and supported
parameters. `/api/v1/key` returned 200 using the supplied local file, without
printing the key. V4.1 Flash was initially evaluated but incorrectly labeled
one Chinese sentence as Vietnamese and returned Chinese rather than translating
to Vietnamese. V3.2 was selected after correctly handling that fixture and the
other tested directions. This small sample is not a quality guarantee.

Separate OPENROUTER_API_KEY / OPENROUTER_API_KEY_FILE prevents accidental use of
9Router's key. OpenRouter endpoint is fixed HTTPS with redirects disabled.
Legacy ROUTER_* variables remain available only for explicit rollback to
TRANSLATION_PROVIDER=9router. No automatic cross-provider fallback.

TDD: `946d341` RED (missing provider selection and credential isolation),
`98a5b11` GREEN. Tests updated for the final V3.2 choice and passed.
`npm run test:coverage`: 75/75 PASS, lines 92.67%, branches 89.48%, functions
81.25% for Node-instrumented files. `npm run check`, `git diff --check`: PASS.
No dependencies added. API error bodies and credentials remain private;
UI discloses OpenRouter processing. No auth/password changes.

Real local full-pipeline smoke with Google-generated input:
- vi→zh: 4983ms; preserved not fifteen tickets, only two.
- zh→vi: 3307ms; preserved tomorrow/not/airport.
- en→vi: 6811ms; preserved two tickets/tomorrow.
- vi→en: 3816ms; preserved negation and ticket quantities.
All returned nonempty WaveNet PCM. Latencies exclude input fixture generation
and silence detection, and vary with provider routing/network/load.

Local `.env.local` selects OpenRouter, with a path to the user's file, not a
copied key. Railway receives the key through stdin into OPENROUTER_API_KEY.
Source upload excludes `.env*` and artifacts. Old key is not deleted/revoked.

References:
- https://openrouter.ai/deepseek/deepseek-v3.2
- https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- https://openrouter.ai/api/v1/models
