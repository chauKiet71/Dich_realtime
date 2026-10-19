import test from 'node:test';
import assert from 'node:assert/strict';
import { Utterance } from '../public/utterance.js';
test('utterance discards idle silence, preserves preroll and commits after 700ms silence', () => {
  const utterance=new Utterance();
  const silent=new Int16Array(2400).buffer;
  const voiced=new Int16Array(2400).fill(5000).buffer;
  for (let t=0;t<2000;t+=100) assert.equal(utterance.push(silent,t),false);
  for (let t=2000;t<=2300;t+=100) assert.equal(utterance.push(voiced,t),false);
  for (let t=2400;t<3000;t+=100) assert.equal(utterance.push(silent,t),false);
  assert.equal(utterance.push(silent,3000),true);
  assert.equal(utterance.take().byteLength,13*4800);
  assert.equal(utterance.bytes,0);
});
test('utterance caps captured audio at 30 seconds', () => {
  const utterance=new Utterance();
  const frame=new Int16Array(2400).fill(5000).buffer;
  for (let i=0;i<300;i++) utterance.push(frame,i*100);
  assert.throws(()=>utterance.push(frame,30000));
});
