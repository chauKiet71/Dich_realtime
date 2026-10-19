import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SilenceGate, TranscriptStore } from '../public/core.js';

test('silence alone never submits an empty turn', () => {
  const gate = new SilenceGate();
  assert.equal(gate.sample(0, 0), false);
  assert.equal(gate.sample(0, 9000), false);
});
test('submits exactly once after 700ms silence, never early', () => {
  const gate = new SilenceGate();
  gate.sample(0.1, 0); gate.sample(0.1, 200);
  assert.equal(gate.sample(0, 899), false);
  assert.equal(gate.sample(0, 900), true);
  assert.equal(gate.sample(0, 5000), false);
});
test('resumed speech resets the silence deadline', () => {
  const gate = new SilenceGate();
  gate.sample(0.1, 0); gate.sample(0.1, 200);
  assert.equal(gate.sample(0, 800), false); gate.sample(0.1, 850);
  assert.equal(gate.sample(0, 1549), false);
  assert.equal(gate.sample(0, 1550), true);
});
test('short clicks do not submit, reset clears pending speech', () => {
  const gate = new SilenceGate();
  gate.sample(0.1, 0);
  assert.equal(gate.sample(0, 2000), false);
  gate.sample(0.1, 3000); gate.sample(0.1, 3200);
  gate.reset();
  assert.equal(gate.sample(0, 9000), false);
});
test('transcript items remain ordered even when completions arrive late', () => {
  const store = new TranscriptStore();
  store.update('first', 'Xin ', false);
  store.update('second', '你好', true);
  store.update('first', 'Xin chào', true);
  store.update('first', 'stale delta', false);
  assert.deepEqual(store.items().map(x => x.text), ['Xin chào', '你好']);
});
test('remaining silence and adjustable noise threshold are consistent', () => {
  const gate = new SilenceGate({ threshold: 0.04 });
  assert.equal(gate.remaining(0), null);
  gate.sample(0.02, 0);
  assert.equal(gate.remaining(0), null);
  gate.sample(0.05, 20); gate.sample(0.05, 220);
  assert.equal(gate.remaining(420), 500);
  assert.equal(gate.remaining(5000), 0);
});
test('transcript storage is bounded and joins incremental text', () => {
  const store = new TranscriptStore();
  store.update('a', 'xin'); store.update('a', ' chào');
  assert.equal(store.items()[0].text, 'xin chào');
  for (let i = 0; i < 205; i++) store.update(String(i), 'x', true);
  assert.equal(store.items().length, 200);
  assert.equal(store.items()[0].id, '5');
});
