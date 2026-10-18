# Two language modes — 2026-10-19

- Scope: Vietnamese/Mandarin (default), Vietnamese/English. No Chinese/English mode.
- RED: 2 new tests failed as expected: English config still used zh; unsupported pair reached provider. Checkpoint 5b64978.
- GREEN: all 20 tests pass; npm run check passes. Tested-code coverage: 96.70% lines, 94.69% branches. Browser app is outside Node coverage.
- Integration tests assert both pair configs sent upstream; invalid/empty/injection-like pair values rejected before upstream. Existing auth, quota, SDP, secret handling and 2-second silence tests pass.
- Browser QA with mocked WebRTC: exactly two options; English selection updates title/intro/badges; outgoing request uses vi-en; selector disabled during session; stop releases track and unlocks selector; switching back restores Mandarin labels.
- Mobile 390px: document width 390px, selector visible, no horizontal overflow.
- Security/diff review: pair is allowlisted server-side; only fixed server-owned language names reach prompt; DOM updates use textContent. No credentials added.
- No build/typecheck required for this native JavaScript buildless project.
- This change has not been deployed to Railway. Live English speech translation quality and latency have not been measured; browser QA used synthetic media and mocked signaling.
