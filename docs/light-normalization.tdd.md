# Light normalization in the existing Realtime response

User journey: speakers of Vietnamese, Mandarin Chinese or English receive a fluent, faithful translation without a separate normalization request.

Implementation: a shared policy is appended to both single-device language pairs and both Vietnamese/Chinese room directions. It permits only unambiguous removal of non-semantic disfluencies; preserves facts, numbers, uncertainty, negation and meaningful tone; prohibits guessing or outputting a normalized source sentence. Existing speech-to-speech streaming, model, 700 ms silence gate and playback speed are unchanged. Transcription remains a separate display stream, not an extra normalization pipeline. No new API request or buffering stage is introduced.

RED: `node --test test/translation-policy.test.js` failed all four configuration cases before implementation.
GREEN: `npm run check`, `npm run test:coverage`, and `git diff --check` passed. 52/52 tests; coverage 90.56% lines, 88.08% branches, 80.68% functions.

These tests verify configuration delivery and existing regressions, not actual model compliance or translation quality. No live provider call or latency benchmark was performed. Added prompt text may affect processing time; no speedup is claimed. Restart the server and start a new session to apply. Production deployment is not included.

Manual evaluation examples (not yet run):
- Vietnamese: “Ờ… tôi chưa trả 15 đô, không phải 50.” Preserve negation, amount and correction.
- Chinese: “我可能明天去，不是今天。” Preserve uncertainty and tomorrow/not today.
- English: “I need fifteen, sorry, fifty units.” Preserve final explicit correction to fifty.
- All languages: keep emphatic repetition; request repetition when names or numbers are genuinely ambiguous rather than inventing them.
