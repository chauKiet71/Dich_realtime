import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionConfig } from '../lib/session.js';
import { roomSessionConfig } from '../lib/rooms.js';

for (const [name, config] of [
  ['Vietnamese / Chinese', () => sessionConfig({}, 'vi-zh')],
  ['Vietnamese / English', () => sessionConfig({}, 'vi-en')],
  ['Vietnamese room speaker', () => roomSessionConfig({}, 'vi')],
  ['Chinese room speaker', () => roomSessionConfig({}, 'zh')],
]) {
  test(`${name} requests conservative normalization within the existing translation response`, () => {
    const session = config();
    assert.match(session.instructions, /Light normalization and translation must happen in the same response/);
    assert.match(session.instructions, /Never guess missing or unclear words/);
    assert.match(session.instructions, /Preserve names, numbers, units, dates, negation, uncertainty/);
    assert.match(session.instructions, /Do not output a normalized source sentence/);
    assert.match(session.instructions, /Keep meaningful repetition, emphasis, politeness and emotion/);
    assert.deepEqual(session.output_modalities, ['audio']);
    assert.equal(session.audio.input.turn_detection, null);
    assert.equal(session.audio.output.speed, 1.1);
    assert.equal(session.model, 'gpt-realtime-2.1');
  });
}
