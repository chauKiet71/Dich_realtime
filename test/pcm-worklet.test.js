import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/pcm-worklet.js', import.meta.url), 'utf8');
function processor(sampleRate) {
  let Type;
  const messages = [];
  const context = { sampleRate, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => messages.push(data) }; } }, registerProcessor: (_, constructor) => { Type = constructor; } };
  vm.runInNewContext(source, context);
  return { node: new Type(), messages };
}
test('capture is muted until granted and resamples 48k input to 24k PCM16', () => {
  const { node, messages } = processor(48000);
  node.process([[new Float32Array(4800).fill(0.5)]]); assert.equal(messages.length, 0);
  node.port.onmessage({ data: true }); node.process([[new Float32Array(4800).fill(0.5)]]);
  assert.equal(messages[0].byteLength, 4800);
  assert.equal(new Int16Array(messages[0])[0], 16384);
});
test('flush sends the last partial frame before acknowledgement and disables capture', () => {
  const { node, messages } = processor(24000);
  node.port.onmessage({ data: true }); node.process([[new Float32Array(1000).fill(-0.5)]]);
  node.port.onmessage({ data: 'flush' });
  assert.equal(messages[0]?.byteLength, 2000);
  assert.equal(new Int16Array(messages[0])[0], -16384);
  assert.equal(messages[1], 'flushed');
  node.process([[new Float32Array(2400)]]); assert.equal(messages.length, 2);
});
