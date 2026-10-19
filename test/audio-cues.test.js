import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioCues } from '../public/audio-cues.js';

function fakeAudioContext(state = 'running') {
  const oscillators = [];
  const gains = [];
  const context = {
    state,
    currentTime: 4,
    destination: {},
    createOscillator() {
      const oscillator = {
        frequency: { setValueAtTime(value, at) { oscillator.frequencyValue = [value, at]; } },
        connect() {}, disconnect() {},
        start(at) { oscillator.startedAt = at; },
        stop(at) { oscillator.stoppedAt = at; },
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = {
        gain: {
          setValueAtTime(value, at) { gain.startValue = [value, at]; },
          exponentialRampToValueAtTime(value, at) { gain.endValue = [value, at]; },
        },
        connect() {}, disconnect() {},
      };
      gains.push(gain);
      return gain;
    },
  };
  return { context, oscillators, gains };
}

test('speech-end cue is one short low beep', () => {
  const { context, oscillators } = fakeAudioContext();
  const cues = new AudioCues(context);

  assert.equal(cues.play('speech-end'), true);
  assert.equal(oscillators.length, 1);
  assert.equal(oscillators[0].frequencyValue[0], 620);
  assert.ok(oscillators[0].stoppedAt - oscillators[0].startedAt <= 0.13);
});

test('translation-end cue is a distinct rising double beep and completes once', () => {
  const { context, oscillators } = fakeAudioContext();
  const cues = new AudioCues(context);
  let completed = 0;

  assert.equal(cues.play('translation-end', () => completed++), true);
  assert.deepEqual(oscillators.map(node => node.frequencyValue[0]), [820, 1040]);
  assert.ok(oscillators[1].startedAt > oscillators[0].startedAt);

  oscillators[0].onended();
  assert.equal(completed, 0);
  oscillators[1].onended();
  assert.equal(completed, 1);
});

test('unavailable audio never blocks the completion callback', async () => {
  const { context } = fakeAudioContext('suspended');
  const cues = new AudioCues(context);
  let completed = false;

  assert.equal(cues.play('translation-end', () => { completed = true; }), false);
  await Promise.resolve();
  assert.equal(completed, true);
});

test('stopping cues prevents stale completion callbacks', () => {
  const { context, oscillators } = fakeAudioContext();
  const cues = new AudioCues(context);
  let completed = false;

  cues.play('translation-end', () => { completed = true; });
  cues.stop();
  oscillators.forEach(node => node.onended?.());

  assert.equal(completed, false);
});
