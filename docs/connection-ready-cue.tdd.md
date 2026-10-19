# Connection-ready cue

Request: play the existing audio when connecting transitions to listening.

Implemented for the one-device conversation screen in the request. Load `/turn-end.wav` before establishing RTC, play once from the data-channel open handler, then enable capture after playback. The epoch guard and cue cancellation prevent a stopped session from enabling capture. Normal subsequent listening turns do not invoke this cue. Existing end-of-speech and translation cues are unchanged.

RED: `node --test test/audio-cues.test.js` failed the two new supplied-buffer and cancellation cases before implementation.
GREEN: `npm run check` and `npm run test:coverage` pass after implementation. Additional load/fallback test checks the existing WAV path and offline fallback.

No live microphone/provider session or physical speaker output was tested. The preview on port 3001 is unconfigured; this cue requires a successful connection.
