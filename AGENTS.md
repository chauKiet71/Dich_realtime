# Dich_realtime

## Working conventions

- Communicate with the user in Vietnamese unless requested otherwise.
- Stack: Node.js 22+ HTTP server and browser-native HTML/CSS/JavaScript with WebRTC + Web Audio. Provider: OpenAI Realtime for Mandarin/Vietnamese speech translation. No runtime dependencies or database.
- Use the installed ECC native Codex plugin (`ecc@ecc`) when its skills fit the task. Read the relevant SKILL.md before applying it; do not load the entire skill catalog.
- For substantial features, outline a practical plan, implement within the user's authorized scope, review changes, and run the relevant checks.
- Use `tdd-workflow` for substantive business logic and regression fixes, and `verification-loop` before reporting an implementation complete. Keep checks proportional to the change.
- Use `security-review` when implementing authentication, external input handling, or secret-bearing integrations.
- Commands: `npm start` (local server), `npm run dev` (watch), `npm test` (Node unit/integration tests), `npm run test:coverage`, `npm run check` (JavaScript syntax). This buildless app has no build or TypeScript step.
- API keys stay server-side. The ignored `.env.local` selects an external key file via `OPENAI_API_KEY_FILE`; never print its contents. Railway uses its `OPENAI_API_KEY` variable. Production requires HTTPS `PUBLIC_ORIGIN` and `APP_ACCESS_PASSWORD` (HTTP Basic username `songngu`), with server-enforced session creation quotas. Never upload `.env*` or `artifacts/`.
- Use PowerShell-compatible commands on Windows.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
