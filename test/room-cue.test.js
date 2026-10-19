import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomAudio } from '../public/room-audio.js';

function audio() {
  const events = [];
  const room = new RoomAudio(() => assert.fail('cue must not enter capture'), () => assert.fail('optional cue must not fail the call'));
  room.context = {
    state: 'running', currentTime: 10, destination: {}, close: async () => {},
    createBufferSource: () => ({ connect: () => events.push('connect'), start: () => events.push('start'), stop: () => events.push('stop'), disconnect: () => events.push('disconnect') }),
  };
  room.cueBuffer = {}; return { room, events };
}
test('cue starts synchronously and does not affect translated-audio drain acknowledgement', () => {
  const { room, events } = audio();
  assert.equal(room.playTurnEnd(), undefined);
  assert.deepEqual(events, ['connect', 'start']);
  assert.equal(room.sources.size, 0);
  assert.equal(room.drained(), true);
  room.cueSource.onended(); assert.equal(room.cueSource, null);
});
test('reopening microphone or leaving stops any remaining local cue', () => {
  const { room, events } = audio();
  room.playTurnEnd(); room.capture(true);
  assert.deepEqual(events.slice(-2), ['stop', 'disconnect']);
  room.playTurnEnd(); room.close();
  assert.equal(room.cueSource, null); assert.equal(room.cueBuffer, null);
});
test('missing cue, suspended context, or playback failure does not interrupt translation', () => {
  const { room, events } = audio();
  room.cueBuffer = null; room.playTurnEnd(); assert.deepEqual(events, []);
  room.cueBuffer = {}; room.context.state = 'suspended'; room.playTurnEnd(); assert.deepEqual(events, []);
  room.context.state = 'running'; room.context.createBufferSource = () => { throw new Error('Audio unavailable'); };
  assert.doesNotThrow(() => room.playTurnEnd());
});
