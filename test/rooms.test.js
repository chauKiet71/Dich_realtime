import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

async function setup(t, options = {}) {
  const app = createApp({ keyLoader: async () => 'test', ...options });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { Origin: base, 'X-Translation-Client': '1', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { app, base, post };
}

test('create private room and join once with opposite language; never expose member tokens', async t => {
  const { post } = await setup(t);
  const response = await post('/api/rooms', { language: 'vi' });
  assert.equal(response.status, 201);
  const host = await response.json();
  assert.match(host.roomId, /^[a-f0-9]{32}$/);
  assert.match(host.invite, /^[a-f0-9]{48}$/);
  const joined = await post('/api/rooms/join', { roomId: host.roomId, invite: host.invite });
  assert.equal(joined.status, 200);
  const guest = await joined.json();
  assert.equal(guest.language, 'zh');
  assert.notEqual(guest.token, host.token);
  assert.equal(guest.invite, undefined);
  assert.equal((await post('/api/rooms/join', { roomId: host.roomId, invite: host.invite })).status, 409);
});

test('room admission rejects invalid language, origin, content type and invite', async t => {
  const { post } = await setup(t);
  assert.equal((await post('/api/rooms', { language: 'en' })).status, 400);
  assert.equal((await post('/api/rooms', { language: 'vi' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/rooms', { language: 'vi' }, { 'Content-Type': 'text/plain' })).status, 415);
  const host = await (await post('/api/rooms', { language: 'zh' })).json();
  assert.equal((await post('/api/rooms/join', { roomId: host.roomId, invite: 'wrong' })).status, 403);
  assert.equal((await post('/api/rooms', { language: 'vi', junk: 'x'.repeat(5000) })).status, 413);
});

test('room creation is bounded and room page/assets are served', async t => {
  const { post, base } = await setup(t);
  for (let i = 0; i < 6; i++) assert.equal((await post('/api/rooms', { language: 'vi' })).status, 201);
  assert.equal((await post('/api/rooms', { language: 'vi' })).status, 429);
  for (const path of ['/room', '/room.js', '/room.css', '/pcm-worklet.js', '/room-audio.js']) {
    assert.equal((await fetch(base + path)).status, 200);
  }
});
