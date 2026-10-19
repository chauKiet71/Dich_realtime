# 700 ms silence boundary

User request: submit speech for translation after 700 ms of silence in both modes.

- RED: `node --test test/core.test.js` produced 3 expected failures with the old 2000 ms default: deadline, resumed speech and countdown.
- GREEN: `npm run test:coverage` passed 45/45 tests after setting the shared SilenceGate default to 700 ms. Coverage: 89.98% lines, 87.50% branches, 80.23% functions.
- `npm run check` passed. Boundary test rejects 699 ms, submits at 700 ms once, and resumed speech restarts the deadline. Empty silence and short clicks remain rejected.
- UI instructions updated for both modes. Existing UI redesign changes remain separate in the working tree.
- Actual submission occurs on the next audio sampling callback (single device polls every 40 ms; room uses PCM frames). Network/provider latency is additional; this does not promise a completed translation in 700 ms.
- Live microphone/end-to-end latency was not measured.
